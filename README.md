# UltraDev Checkout

**One Step Checkout moderno para OpenMage / Magento 1.x**, com suporte a Pessoa Física e Jurídica, múltiplos meios de pagamento (Pix, Cartão de Crédito e Boleto) e integração nativa com o tema Ultimo.

Desenvolvido para substituir o checkout multi-etapas padrão do OpenMage por um fluxo único, moderno e responsivo, reduzindo abandono de carrinho e simplificando a experiência de compra.

---

## ✨ Funcionalidades

- **Checkout em página única** — endereço, frete, pagamento e revisão do pedido em uma só tela, sem recarregar a página.
- **Suporte a PF e PJ** — alternância entre Pessoa Física (CPF) e Pessoa Jurídica (CNPJ, Razão Social, Inscrição Estadual), incluindo suporte ao novo formato alfanumérico de CNPJ da Receita Federal.
- **Detecção de e-mail existente** — ao digitar um e-mail já cadastrado, o checkout abre automaticamente um modal de login, evitando erro de "e-mail duplicado" na finalização.
- **Login via AJAX** — autenticação sem sair da página do checkout, com pré-preenchimento automático de endereço e dados cadastrais do cliente.
- **Cadastro de conta integrado** — clientes novos podem criar conta durante o checkout, com validação de CPF (algoritmo oficial da Receita Federal) e data de nascimento (idade mínima de 16 anos).
- **Cupom de desconto** — aplicação e remoção de cupons em tempo real via AJAX, com recálculo automático dos totais.
- **Frete dinâmico** — cálculo de frete integrado ao endereço informado, com atualização automática dos métodos disponíveis.
- **Múltiplos meios de pagamento** — Pix, Cartão de Crédito (com parcelamento) e Boleto.
- **Campo de comentários do pedido** — o cliente pode adicionar observações que são salvas como nota interna do pedido.
- **Endereço salvo automaticamente** — o endereço usado na compra é salvo no cadastro do cliente para agilizar compras futuras.
- **Página de sucesso customizada** — resumo do pedido com itens, endereço, frete e status, com layout próprio.

---

## 📋 Requisitos

- OpenMage LTS 20.x (Magento 1.9 compatível)
- PHP >= 7.4 (testado em PHP 8.2)
- Composer
- [`magento-hackathon/magento-composer-installer`](https://github.com/Cotya/magento-composer-installer) configurado no projeto

---

## 🚀 Instalação

### Via Composer (recomendado)

```bash
composer require ultradev/magento-checkout
```

O módulo usa `magento-deploystrategy: copy`, ou seja, os arquivos são **copiados** para dentro da estrutura do Magento (não symlinkados automaticamente pelo Composer). Após instalar ou atualizar o pacote, é necessário limpar o cache:

```bash
php n98-magerun.phar cache:flush
```

> ⚠️ **Atenção**: por usar `copy` como estratégia de deploy, alterações feitas diretamente nos arquivos ativos (`app/code/community/...`) **não são refletidas automaticamente** de volta no pacote em `vendor/`, e vice-versa após um `composer update`. Sempre edite os arquivos na origem correta e sincronize manualmente quando necessário.

### Via modman (instalação manual/desenvolvimento)

```bash
modman link ultradev/magento-checkout
```

O arquivo `modman` já mapeia todos os arquivos necessários, incluindo o layout específico do tema Ultimo (veja a seção [Estrutura do módulo](#-estrutura-do-módulo)).

---

## ⚙️ Configuração

Após a instalação, habilite o módulo em:

**Admin → System → Configuration → UltraDev → Checkout**

Configurações disponíveis incluem habilitar/desabilitar o redirecionamento automático do checkout padrão para o Ultra Checkout, e opções específicas de exibição de campos.

---

## 📁 Estrutura do módulo

app/code/community/UltraDev/Checkout/
├── Block/
│ ├── Checkout.php → Bloco principal do checkout
│ └── Success/Details.php → Bloco da página de sucesso
├── Helper/Data.php → Helper geral do módulo
├── Model/
│ ├── Processor.php → Núcleo do processamento: cliente, endereços, frete, pagamento e submissão do pedido
│ └── Observer.php → Redirecionamento automático do checkout padrão
├── controllers/
│ └── IndexController.php → Endpoints AJAX (login, cadastro, cupom, frete, finalização)
├── etc/
│ ├── config.xml → Configuração do módulo
│ ├── system.xml → Campos de configuração no Admin
│ └── adminhtml.xml
└── sql/ultradev_checkout_setup/
└── install-1.0.0.php → Instala atributos customizados de cliente (CNPJ, tipo de pessoa, etc.)

app/design/frontend/
├── base/default/
│ ├── layout/ultradev_checkout.xml
│ └── template/ultradev/checkout/
│ ├── checkout.phtml → Template principal do checkout
│ ├── root.phtml / root_success.phtml
│ ├── success.phtml → Página de sucesso
│ └── payment-icons.phtml
└── ultimo/default/
└── layout/ultradev_checkout.xml → Override necessário para o tema Ultimo

skin/frontend/base/default/
├── css/ultradev/
│ ├── ultradev-checkout.css
│ └── success.css
└── js/ultradev/
└── ultradev-checkout.js → Lógica do checkout: formulário, AJAX, validações, cupom

app/locale/pt_BR/
└── UltraDev_Checkout_Customer.csv

> 💡 **Nota sobre temas**: o Magento resolve layout e template de forma independente através do sistema de fallback (`tema atual` → `base/default`). O layout do tema **Ultimo** (`app/design/frontend/ultimo/default/layout/ultradev_checkout.xml`) é um arquivo físico separado do pacote `base/default` e precisa existir para que a página de sucesso (`ultradev_checkout_index_success`) seja renderizada corretamente nesse tema. Ao portar o módulo para outro tema, verifique se um layout equivalente precisa ser criado.

---

## 🔑 Rotas principais

| Rota | Descrição |
|---|---|
| `ultra-checkout/index/index` | Página principal do checkout |
| `ultra-checkout/index/success` | Página de sucesso pós-pedido |
| `ultra-checkout/index/placeOrder` | Endpoint AJAX de finalização do pedido |
| `ultra-checkout/index/login` | Endpoint AJAX de autenticação |
| `ultra-checkout/index/coupon` | Endpoint AJAX de aplicação/remoção de cupom |

---

## 📄 Licença

MIT © [UltraDev](https://ultradev.com.br)

---

## 👤 Autor

**UltraDev**
📧 contato@ultradev.com.br
🌐 [ultradev.com.br](https://ultradev.com.br)
