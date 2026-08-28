import { createClient } from "@/lib/supabase/server";
import {
  calculateAvailableLimit,
  calculateCommittedLimit,
  determineCycleForReferenceMonth,
  determineInvoiceCycle,
} from "@/lib/finance/cards/engine";
import type {
  CardDetail,
  CardInvoice,
  CardOverview,
  CreditCard,
  InvoiceInstallment,
} from "@/types/cards";

export function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function getCreditCards(workspaceId: string): Promise<CardOverview[]> {
  const supabase = await createClient();
  const [cardsResult, installmentsResult, invoicesResult] = await Promise.all([
    supabase
      .from("credit_cards")
      .select(`
        id, workspace_id, name, limit_amount, closing_day, due_day,
        payment_account_id, active, created_at, payment_account:accounts(name)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("card_installments")
      .select("credit_card_id, invoice_id, amount, status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("card_invoices")
      .select("id, credit_card_id, reference_month, status")
      .eq("workspace_id", workspaceId),
  ]);

  const error = cardsResult.error ?? installmentsResult.error ?? invoicesResult.error;
  if (error) throw new Error(`Não foi possível carregar os cartões: ${error.message}`);

  const cards = (cardsResult.data ?? []) as unknown as CreditCard[];
  const installments = installmentsResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  const today = getTodayInSaoPaulo();

  return cards.map((card) => {
    const cardInstallments = installments.filter((item) => item.credit_card_id === card.id);
    const committedLimit = calculateCommittedLimit(cardInstallments);
    const referenceMonth = determineInvoiceCycle(
      today,
      card.closing_day,
      card.due_day,
    ).referenceMonth;
    const invoice = invoices.find(
      (item) => item.credit_card_id === card.id && item.reference_month === referenceMonth,
    );
    const invoiceTotal = invoice
      ? cardInstallments
          .filter((item) => item.invoice_id === invoice.id && item.status !== "cancelled")
          .reduce((total, item) => total + Number(item.amount), 0)
      : 0;

    return {
      ...card,
      availableLimit: calculateAvailableLimit(card.limit_amount, committedLimit),
      committedLimit,
      currentInvoice: {
        referenceMonth,
        status: (invoice?.status as CardOverview["currentInvoice"]["status"]) ?? null,
        total: invoiceTotal,
      },
    };
  });
}

export async function getCreditCard(
  workspaceId: string,
  cardId: string,
): Promise<CreditCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_cards")
    .select(`
      id, workspace_id, name, limit_amount, closing_day, due_day,
      payment_account_id, active, created_at, payment_account:accounts(name)
    `)
    .eq("workspace_id", workspaceId)
    .eq("id", cardId)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar o cartão: ${error.message}`);
  return data as unknown as CreditCard | null;
}

export async function getCardDetail(
  card: CreditCard,
  referenceMonth: string,
): Promise<CardDetail> {
  const supabase = await createClient();
  const [invoiceResult, committedResult] = await Promise.all([
    supabase
      .from("card_invoices")
      .select("id, reference_month, closing_date, due_date, status")
      .eq("workspace_id", card.workspace_id)
      .eq("credit_card_id", card.id)
      .eq("reference_month", `${referenceMonth}-01`)
      .maybeSingle(),
    supabase
      .from("card_installments")
      .select("amount, status")
      .eq("workspace_id", card.workspace_id)
      .eq("credit_card_id", card.id),
  ]);

  const error = invoiceResult.error ?? committedResult.error;
  if (error) throw new Error(`Não foi possível carregar a fatura: ${error.message}`);

  const invoice = invoiceResult.data as CardInvoice | null;
  let installments: InvoiceInstallment[] = [];
  if (invoice) {
    const { data, error: installmentsError } = await supabase
      .from("card_installments")
      .select(`
        id, amount, installment_number, installment_total, status,
        purchase:card_purchases(description, purchase_date, category:categories(name))
      `)
      .eq("workspace_id", card.workspace_id)
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true });
    if (installmentsError) {
      throw new Error(`Não foi possível carregar as parcelas: ${installmentsError.message}`);
    }
    installments = (data ?? []) as unknown as InvoiceInstallment[];
  }

  const committedLimit = calculateCommittedLimit(committedResult.data ?? []);
  return {
    availableLimit: calculateAvailableLimit(card.limit_amount, committedLimit),
    card,
    committedLimit,
    installments,
    invoice,
    invoiceCycle: invoice
      ? {
          closingDate: invoice.closing_date,
          dueDate: invoice.due_date,
          referenceMonth: invoice.reference_month,
        }
      : determineCycleForReferenceMonth(referenceMonth, card.closing_day, card.due_day),
    invoiceTotal: installments
      .filter((item) => item.status !== "cancelled")
      .reduce((total, item) => total + Number(item.amount), 0),
  };
}
