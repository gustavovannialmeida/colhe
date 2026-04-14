# Colhe — Plataforma de Cotações Agro

## Setup rápido

### 1. Supabase
1. Crie um novo projeto no Supabase (mesma organização, ex: `colhe`)
2. No SQL Editor, rode o arquivo `cotafacil_schema.sql`
3. Em **Storage → New bucket**: nome `invoices`, marque como **Private**
4. Em **Authentication → Settings**: confirme que Email Auth está habilitado
5. Em **Authentication → Users → Invite user**: crie os vendedores

### 2. Variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto:

```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

Pegue esses valores em **Project Settings → API** no Supabase.

### 3. Rodar localmente
```bash
npm install
npm run dev
```

### 4. Deploy no Vercel
1. Suba o projeto para um novo repositório GitHub (ex: `colhe`)
2. Conecte ao Vercel: **New Project → Import**
3. Adicione as variáveis de ambiente no Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

---

## Funcionalidades

- **Login** por e-mail/senha — cada vendedor com acesso individual
- **Dashboard** — KPIs, receita mensal, status das cotações
- **Cotações** — criar, editar, filtrar por status/vendedor
  - Custo por item (independente do produto base)
  - Margem bruta e líquida calculadas em tempo real
  - Desconto por item
  - Frete e comissão por cotação
- **Fluxo de status**: Rascunho → Enviada → Em Negociação → Fechada / Perdida
  - Perda exige motivo obrigatório
  - Histórico completo de alterações
- **Notas fiscais** — upload de NF de compra e venda por item (PDF, XML, imagem)
- **Relatórios** — funil de conversão, motivos de perda, ranking por vendedor
- **Configurações** — cadastro de clientes, produtos e vendedores
- **Admin vs Vendedor** — admin vê tudo; vendedor vê apenas as próprias cotações

---

## Primeiro acesso
1. Crie um usuário pelo painel do Supabase (Authentication → Invite user)
2. Ele recebe o e-mail de convite e define a senha
3. No primeiro login, o perfil é criado automaticamente
4. Para promover a admin: em Configurações → Vendedores → Editar → Papel: Admin

## Estrutura do projeto
```
src/
├── lib/
│   ├── supabase.js       Conexão Supabase
│   └── helpers.js        Formatadores e utilitários
├── contexts/
│   └── AuthContext.jsx   Autenticação global
├── components/
│   └── Layout.jsx        Sidebar + mobile nav
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx
    ├── Quotations.jsx
    ├── QuotationNew.jsx   Criar/editar cotação
    ├── QuotationDetail.jsx
    ├── Reports.jsx
    └── Settings.jsx
```
