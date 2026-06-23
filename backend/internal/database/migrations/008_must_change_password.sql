-- 008: força a troca de senha no primeiro acesso após o admin definir ou
-- resetar a senha de um usuário. O administrador não conhece a senha antiga
-- (não há fluxo de "esqueci minha senha"), então toda senha que o admin gera
-- é tratada como temporária. Aditivo e idempotente.

-- Marca que a próxima sessão deve obrigar a troca de senha antes de usar o app.
-- Default false: os usuários e admins já existentes seguem usando a senha atual.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
