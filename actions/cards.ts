"use server";

import { revalidatePath } from "next/cache";

import {
  getActiveWorkspace,
  requireWorkspaceEditor,
} from "@/lib/finance/context";
import {
  generateInstallmentPlan,
  getEffectiveInvoiceStatus,
  parseMoneyToCents,
} from "@/lib/finance/cards/engine";
import { getTodayInSaoPaulo } from "@/lib/finance/cards/data";
import type { ActionState } from "@/types/finance";

function parseDay(value: FormDataEntryValue | null) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export async function createCreditCard(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const limitAmount = String(formData.get("limit_amount") ?? "").trim();
  const closingDay = parseDay(formData.get("closing_day"));
  const dueDay = parseDay(formData.get("due_day"));
  const paymentAccountId = String(formData.get("payment_account_id") ?? "") || null;

  if (!name || name.length > 120) return { error: "Informe um nome válido." };
  if (closingDay === null || dueDay === null) {
    return { error: "Fechamento e vencimento devem estar entre os dias 1 e 31." };
  }

  let limitCents: number;
  try {
    limitCents = parseMoneyToCents(limitAmount);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Limite inválido." };
  }

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase, user } = await requireWorkspaceEditor(workspace.id);

    if (paymentAccountId) {
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("id", paymentAccountId)
        .eq("workspace_id", workspace.id)
        .eq("active", true)
        .maybeSingle();
      if (!account) return { error: "A conta de pagamento é inválida ou está inativa." };
    }

    const { error } = await supabase.from("credit_cards").insert({
      active: true,
      closing_day: closingDay,
      created_by: user.id,
      due_day: dueDay,
      limit_amount: (limitCents / 100).toFixed(2),
      name,
      payment_account_id: paymentAccountId,
      workspace_id: workspace.id,
    });
    if (error) return { error: `Não foi possível criar o cartão: ${error.message}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro inesperado." };
  }

  revalidatePath("/cards");
  return { success: "Cartão criado com sucesso." };
}

export async function createCardPurchase(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cardId = String(formData.get("credit_card_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const totalAmount = String(formData.get("total_amount") ?? "").trim();
  const purchaseDate = String(formData.get("purchase_date") ?? "");
  const installmentCount = Number(formData.get("installment_count"));
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!cardId || !description || description.length > 200) {
    return { error: "Informe uma descrição válida." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return { error: "Informe uma data de compra válida." };
  }
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 360) {
    return { error: "O número de parcelas deve estar entre 1 e 360." };
  }

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);
    const { data: card } = await supabase
      .from("credit_cards")
      .select("id, closing_day, due_day")
      .eq("id", cardId)
      .eq("workspace_id", workspace.id)
      .eq("active", true)
      .maybeSingle();
    if (!card) return { error: "O cartão é inválido, inativo ou inacessível." };

    if (categoryId) {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("workspace_id", workspace.id)
        .eq("active", true)
        .maybeSingle();
      if (!category) return { error: "A categoria selecionada é inválida ou inativa." };
    }

    generateInstallmentPlan({
      closingDay: card.closing_day,
      dueDay: card.due_day,
      installmentCount,
      purchaseDate,
      totalAmount,
    });

    const { error } = await supabase.rpc("create_card_purchase", {
      p_category_id: categoryId,
      p_credit_card_id: cardId,
      p_description: description,
      p_installment_count: installmentCount,
      p_notes: notes,
      p_purchase_date: purchaseDate,
      p_total_amount: totalAmount.replace(",", "."),
    });
    if (error) return { error: `Não foi possível registrar a compra: ${error.message}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro inesperado." };
  }

  revalidatePath("/cards");
  revalidatePath(`/cards/${cardId}`);
  return { success: "Compra registrada e parcelas geradas com sucesso." };
}

export async function payCardInvoice(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const cardId = String(formData.get("credit_card_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const paymentDate = String(formData.get("payment_date") ?? "");

  if (!invoiceId || !cardId || !accountId) {
    return { error: "Selecione uma conta para pagamento." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return { error: "Informe uma data de pagamento válida." };
  }

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);

    const { data: invoice } = await supabase
      .from("card_invoices")
      .select("id, credit_card_id, closing_date, status")
      .eq("id", invoiceId)
      .eq("credit_card_id", cardId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    if (!invoice) return { error: "A fatura é inválida ou inacessível." };

    const effectiveStatus = getEffectiveInvoiceStatus(invoice, getTodayInSaoPaulo());
    if (effectiveStatus === "open") return { error: "Faturas abertas não podem ser pagas antecipadamente." };
    if (effectiveStatus === "paid") return { error: "Esta fatura já foi paga." };

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("workspace_id", workspace.id)
      .eq("active", true)
      .maybeSingle();
    if (!account) return { error: "A conta é inválida, inativa ou pertence a outro workspace." };

    const { error } = await supabase.rpc("pay_card_invoice", {
      p_account_id: accountId,
      p_invoice_id: invoiceId,
      p_payment_date: paymentDate,
    });
    if (error) return { error: `Não foi possível pagar a fatura: ${error.message}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro inesperado." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/cards");
  revalidatePath(`/cards/${cardId}`);
  return { success: "Fatura paga com sucesso." };
}
