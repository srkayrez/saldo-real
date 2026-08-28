import { createClient } from "@/lib/supabase/server";
import { getTodayInSaoPaulo } from "@/lib/finance/date";
import {
  calculateAvailableLimit,
  calculateCommittedLimit,
  determineCycleForReferenceMonth,
  determineInvoiceCycle,
  getEffectiveInvoiceStatus,
} from "@/lib/finance/cards/engine";
import type {
  CardDetail,
  CardInvoice,
  CardInvoicePayment,
  CardOverview,
  CreditCard,
  InvoiceInstallment,
} from "@/types/cards";

export { getTodayInSaoPaulo } from "@/lib/finance/date";

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
      .select("id, credit_card_id, reference_month, closing_date, status")
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
        status: invoice
          ? getEffectiveInvoiceStatus(invoice, today)
          : null,
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
  let payment: CardInvoicePayment | null = null;
  if (invoice) {
    const [installmentsResult, paymentResult] = await Promise.all([
      supabase
        .from("card_installments")
        .select(`
          id, amount, installment_number, installment_total, status,
          purchase:card_purchases(description, purchase_date, category:categories(name))
        `)
        .eq("workspace_id", card.workspace_id)
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("card_invoice_payments")
        .select("id, account_id, transaction_id, amount, payment_date, account:accounts(name)")
        .eq("workspace_id", card.workspace_id)
        .eq("invoice_id", invoice.id)
        .maybeSingle(),
    ]);
    const detailError = installmentsResult.error ?? paymentResult.error;
    if (detailError) throw new Error(`Não foi possível carregar a fatura: ${detailError.message}`);
    installments = (installmentsResult.data ?? []) as unknown as InvoiceInstallment[];
    payment = paymentResult.data as unknown as CardInvoicePayment | null;
  }

  const committedLimit = calculateCommittedLimit(committedResult.data ?? []);
  return {
    availableLimit: calculateAvailableLimit(card.limit_amount, committedLimit),
    card,
    committedLimit,
    effectiveStatus: getEffectiveInvoiceStatus(invoice, getTodayInSaoPaulo()),
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
    payment,
  };
}

export async function getInvoiceForPayment(
  card: CreditCard,
  invoiceId: string,
): Promise<CardDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("card_invoices")
    .select("reference_month")
    .eq("id", invoiceId)
    .eq("workspace_id", card.workspace_id)
    .eq("credit_card_id", card.id)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a fatura: ${error.message}`);
  if (!data) return null;
  return getCardDetail(card, data.reference_month.slice(0, 7));
}
