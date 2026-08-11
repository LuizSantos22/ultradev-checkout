# UltraDev Checkout

**Modern One Step Checkout for OpenMage / Magento 1.x**, with support for Individual (PF) and Business (PJ) customers, multiple payment methods (Pix, Credit Card and Boleto), and native integration with the Ultimo theme.

Built to replace OpenMage's default multi-step checkout with a single, modern, responsive flow, reducing cart abandonment and simplifying the purchase experience.

---

## ✨ Features

- **Single-page checkout** — address, shipping, payment, and order review all on one screen, with no page reloads.
- **Individual and Business support** — toggle between Individual (CPF) and Business (CNPJ, Company Name, State Registration), including support for Brazil's new alphanumeric CNPJ format.
- **Existing email detection** — when a customer enters an email already registered, the checkout automatically opens a login modal, preventing "duplicate email" errors at checkout completion.
- **AJAX login** — authenticate without leaving the checkout page, with automatic prefill of the customer's saved address and account data.
- **Integrated account creation** — new customers can create an account during checkout, with CPF validation (official Receita Federal check-digit algorithm) and birthdate validation (minimum age of 16).
- **Discount coupons** — real-time coupon application and removal via AJAX, with automatic total recalculation.
- **Dynamic shipping** — shipping calculation tied to the entered address, with automatically updated available methods.
- **Multiple payment methods** — Pix, Credit Card (with installments), and Boleto.
- **Order comments field** — customers can add notes that are saved as an internal order comment.
- **Automatic address saving** — the address used at checkout is saved to the customer's account to speed up future purchases.
- **Custom success page** — order summary with items, address, shipping, and status, with its own layout.

---

## 📋 Requirements

- OpenMage LTS 20.x (Magento 1.9 compatible)
- PHP >= 7.4 (tested on PHP 8.2)
- Composer
- [`magento-hackathon/magento-composer-installer`](https://github.com/Cotya/magento-composer-installer) configured in the project

---

## 🚀 Installation

### Via Composer (recommended)

```bash
composer require ultradev/magento-checkout
```

The module uses `magento-deploystrategy: copy`, meaning files are **copied** into the Magento file structure (not automatically symlinked by Composer). After installing or updating the package, clear the cache:

```bash
php n98-magerun.phar cache:flush
```

> ⚠️ **Note**: because it uses `copy` as the deploy strategy, changes made directly to the active files (`app/code/community/...`) are **not automatically reflected** back into the package under `vendor/`, and vice versa after a `composer update`. Always edit the correct source files and sync manually when needed.

### Via modman (manual/development install)

```bash
modman link ultradev/magento-checkout
```

The `modman` file already maps all required files, including the theme-specific layout override for Ultimo (see [Module structure](#-module-structure)).

---

## ⚙️ Configuration

After installation, enable the module at:

**Admin → System → Configuration → UltraDev → Checkout**

Available settings include enabling/disabling automatic redirection from the default checkout to Ultra Checkout, plus field-specific display options.

---

## 📁 Module structure
app/code/community/UltraDev/Checkout/
├── Block/
│ ├── Checkout.php → Main checkout block
│ └── Success/Details.php → Success page block
├── Helper/Data.php → General module helper
├── Model/
│ ├── Processor.php → Core processing: customer, addresses, shipping, payment, and order submission
│ └── Observer.php → Automatic redirect from the default checkout
├── controllers/
│ └── IndexController.php → AJAX endpoints (login, registration, coupon, shipping, order placement)
├── etc/
│ ├── config.xml → Module configuration
│ ├── system.xml → Admin configuration fields
│ └── adminhtml.xml
└── sql/ultradev_checkout_setup/
└── install-1.0.0.php → Installs custom customer attributes (CNPJ, person type, etc.)

app/design/frontend/
├── base/default/
│ ├── layout/ultradev_checkout.xml
│ └── template/ultradev/checkout/
│ ├── checkout.phtml → Main checkout template
│ ├── root.phtml / root_success.phtml
│ ├── success.phtml → Success page
│ └── payment-icons.phtml
└── ultimo/default/
└── layout/ultradev_checkout.xml → Required override for the Ultimo theme

skin/frontend/base/default/
├── css/ultradev/
│ ├── ultradev-checkout.css
│ └── success.css
└── js/ultradev/
└── ultradev-checkout.js → Checkout logic: form handling, AJAX, validation, coupons

app/locale/pt_BR/
└── UltraDev_Checkout_Customer.csv

> 💡 **Note on themes**: Magento resolves layout and template independently through its fallback system (`current theme` → `base/default`). The **Ultimo** theme layout (`app/design/frontend/ultimo/default/layout/ultradev_checkout.xml`) is a separate physical file from the `base/default` package and must exist for the success page (`ultradev_checkout_index_success`) to render correctly in that theme. When porting the module to another theme, check whether an equivalent layout override needs to be created.

---

## 🔑 Main routes

| Route | Description |
|---|---|
| `ultra-checkout/index/index` | Main checkout page |
| `ultra-checkout/index/success` | Post-order success page |
| `ultra-checkout/index/placeOrder` | AJAX endpoint for order placement |
| `ultra-checkout/index/login` | AJAX authentication endpoint |
| `ultra-checkout/index/coupon` | AJAX coupon apply/remove endpoint |

---

## 📄 License

MIT © [UltraDev](https://ultradev.com.br)

---

## 👤 Author

**UltraDev**
📧 contato@ultradev.com.br
🌐 [ultradev.com.br](https://ultradev.com.br)
