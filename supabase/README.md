# Banco de dados do Saldo Real

## Histórico

As primeiras estruturas (`profiles`, `workspaces`, `workspace_members`, `accounts` e `categories`) foram criadas manualmente no Supabase. Por isso, `migrations/` registra apenas a evolução incremental do ambiente original e, isoladamente, não reconstrói toda a V1.

`baseline/saldo_real_v1_schema.sql` é o snapshot versionado do schema completo da V1, consolidado a partir de um dump somente de schema e das migrations até `202608310003_v1_schema_consistency.sql`. Ele contém o estado final das tabelas, constraints, índices, funções, triggers, RLS, policies e grants, sem dados de usuários ou dados financeiros.

## Quando usar a baseline

A baseline destina-se exclusivamente a um projeto Supabase novo e vazio, documentação, auditoria e recuperação conceitual. **Não aplique a baseline sobre o banco existente ou sobre produção.** O banco atual deve continuar evoluindo apenas por novas migrations em ordem cronológica.

Em um ambiente novo:

1. provisione um projeto Supabase vazio;
2. confirme que os schemas e roles gerenciados pelo Supabase Auth existem;
3. aplique `baseline/saldo_real_v1_schema.sql` uma única vez;
4. registre/aplique somente migrations criadas depois da versão da baseline;
5. valide signup, RLS e RPCs antes de usar o ambiente.

## Dependência do Supabase Auth

A baseline não recria o schema `auth`. As foreign keys para `auth.users` dependem do Supabase, assim como `auth.uid()`.

Depois da criação de `public.handle_new_user()`, a baseline cria o vínculo confirmado no banco atual:

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
```

Esse trigger cria profile, workspace pessoal, membership owner e categorias padrão. Em ferramentas que não permitam criar triggers no schema gerenciado durante o restore, execute somente essa instrução no SQL Editor do novo projeto após aplicar o restante da baseline.

## Colunas de tipo do workspace

`workspace_type` é a coluna canônica usada pelo aplicativo. A coluna legada `type` permanece na V1 para compatibilidade e é mantida sincronizada por trigger. Não remova nenhuma das duas sem uma migration futura que primeiro confirme ausência de consumidores legados.

## Fluxo futuro

- Não edite nem renomeie migrations já aplicadas.
- Cada mudança de schema deve gerar uma nova migration não destrutiva sempre que possível.
- Functions `SECURITY DEFINER` devem usar `search_path` seguro e autorização explícita.
- Toda tabela financeira deve continuar protegida por RLS e escopo de workspace.
- Nunca adicione dumps com dados, tokens, secrets ou chaves ao repositório.

O arquivo temporário `../supabase-current-schema.sql` foi usado apenas como fonte para a baseline. Depois de conferir a baseline, ele pode e deve ser removido do versionamento; não é necessário para migrations futuras.
