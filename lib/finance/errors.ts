type ErrorLike = { code?: string; message?: string };

export function getFriendlyDatabaseError(error: unknown, fallback: string) {
  const value = (error ?? {}) as ErrorLike;
  const message = value.message?.toLowerCase() ?? "";
  if (value.code === "23505" || message.includes("duplicate key")) return "Já existe um registro com esses dados.";
  if (value.code === "23503" || message.includes("foreign key")) return "Este registro está sendo utilizado e não pode ser alterado dessa forma.";
  if (value.code === "23514" || message.includes("check constraint")) return "Os dados informados não atendem às regras necessárias.";
  if (value.code === "22P02" || message.includes("invalid input syntax")) return "Um dos dados informados é inválido.";
  if (value.code === "42501" || message.includes("row-level security") || message.includes("permission denied")) return "Você não tem permissão para realizar esta ação.";
  return fallback;
}

export function getFriendlyActionError(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (!(error instanceof Error)) return fallback;
  const safePrefixes = ["Sua sessão", "Nenhum workspace", "Você não", "Somente", "A conta", "A categoria", "O cartão", "A fatura", "A meta", "Movimentação", "Pagamento"];
  return safePrefixes.some((prefix) => error.message.startsWith(prefix))
    ? error.message
    : getFriendlyDatabaseError(error, fallback);
}
