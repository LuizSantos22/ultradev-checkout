<?php
class UltraDev_Checkout_IndexController extends Mage_Core_Controller_Front_Action
{
    public function indexAction()
    {
        $helper = Mage::helper('ultradev_checkout');
        if (!$helper->isEnabled()) {
            $this->_redirect('checkout/onepage');
            return;
        }
        $quote = Mage::getSingleton('checkout/session')->getQuote();
        if (!$quote || !$quote->hasItems()) {
            $this->_redirect('checkout/cart');
            return;
        }
        $this->loadLayout();
        $this->renderLayout();
    }

    public function shippingAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        try {
            $postcode = preg_replace('/\D/', '', $this->getRequest()->getPost('postcode'));
            if (strlen($postcode) !== 8) {
                throw new Exception('CEP inválido.');
            }
            $quote = Mage::getSingleton('checkout/session')->getQuote();
            $shippingAddress = $quote->getShippingAddress();
            $shippingAddress->setCountryId('BR')
                            ->setPostcode($postcode)
                            ->setCollectShippingRates(true)
                            ->collectShippingRates();
            $rates = [];
            foreach ($shippingAddress->getAllShippingRates() as $rate) {
                if ($rate->getErrorMessage()) continue;
                $rates[] = [
                    'code'  => $rate->getCode(),
                    'title' => $rate->getCarrierTitle() . ' — ' . $rate->getMethodTitle(),
                    'price' => (float) $rate->getPrice(),
                ];
            }
            $this->getResponse()->setBody(json_encode(['success' => true, 'rates' => $rates]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => $e->getMessage()]));
        }
    }

    public function successAction()
    {
        $order = Mage::getSingleton('checkout/session')->getLastRealOrder();
        if (!$order || !$order->getId()) {
            $this->_redirect('ultra-checkout');
            return;
        }

        // NOVO: autentica a sessão do cliente aqui — fora do request AJAX que
        // criou o pedido — replicando o padrão do MOIP (POST tradicional +
        // redirect). Isso evita o loop de redirecionamento causado pelo
        // renewSession() quando disparado dentro do fluxo AJAX de finalização.
        $customerIdToLogin = Mage::getSingleton('checkout/session')->getUltradevCustomerIdToLogin();
if ($customerIdToLogin && !Mage::getSingleton('customer/session')->isLoggedIn()) {
    $customer = Mage::getModel('customer/customer')->load($customerIdToLogin);
    if ($customer && $customer->getId()) {
        Mage::getSingleton('customer/session')->setCustomerAsLoggedIn($customer);

        // DEBUG TEMPORÁRIO — remover depois do diagnóstico
        Mage::log('=== DEBUG SUCCESS LOGIN ===', null, 'ultradev_debug.log');
        Mage::log('HTTPS: ' . (isset($_SERVER['HTTPS']) ? $_SERVER['HTTPS'] : 'not set'), null, 'ultradev_debug.log');
        Mage::log('X-Forwarded-Proto: ' . (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : 'not set'), null, 'ultradev_debug.log');
        Mage::log('SERVER_PORT: ' . (isset($_SERVER['SERVER_PORT']) ? $_SERVER['SERVER_PORT'] : 'not set'), null, 'ultradev_debug.log');
        Mage::log('REQUEST_URI: ' . (isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'not set'), null, 'ultradev_debug.log');
        Mage::log('HTTP_HOST: ' . (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'not set'), null, 'ultradev_debug.log');
        Mage::log('isSecure() via request: ' . (Mage::app()->getRequest()->isSecure() ? 'TRUE' : 'FALSE'), null, 'ultradev_debug.log');
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        Mage::log('All headers: ' . print_r($headers, true), null, 'ultradev_debug.log');
    }
    Mage::getSingleton('checkout/session')->setUltradevCustomerIdToLogin(null);
}

        $this->loadLayout();
        $this->renderLayout();
    }

    public function placeOrderAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        if (!$this->getRequest()->isPost()) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Requisição inválida.']));
            return;
        }
        $data = $this->getRequest()->getPost();
        $result = Mage::getModel('ultradev_checkout/processor')->process($data);
        $this->getResponse()->setBody(json_encode($result));
    }

    /**
     * NOVO: aplica ou remove um cupom de desconto real via Mage_SalesRule.
     * Espera POST com:
     *   - coupon_code   (string)
     *   - coupon_action ('apply' | 'remove', default 'apply')
     */
    public function couponAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        if (!$this->getRequest()->isPost()) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Requisição inválida.']));
            return;
        }

        $action = $this->getRequest()->getPost('coupon_action', 'apply');
        $code   = trim($this->getRequest()->getPost('coupon_code'));

        try {
            $quote = Mage::getSingleton('checkout/session')->getQuote();

            if ($action === 'remove') {
                $quote->getShippingAddress()->setCollectShippingRates(true);
                $quote->setCouponCode('')->collectTotals()->save();

                $this->getResponse()->setBody(json_encode([
                    'success' => true,
                    'removed' => true,
                    'totals'  => $this->_getCouponTotals($quote),
                ]));
                return;
            }

            if ($code === '') {
                $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Informe um código de cupom.']));
                return;
            }

            $quote->getShippingAddress()->setCollectShippingRates(true);
            $quote->setCouponCode($code)->collectTotals()->save();

            // Recarrega para confirmar que o OpenMage realmente aceitou o código.
            // Se a regra estiver inativa, fora do período, ou as condições não
            // forem atendidas, o Mage_SalesRule ignora o cupom silenciosamente
            // em vez de lançar exceção — por isso a checagem abaixo é necessária.
            $quote = Mage::getSingleton('checkout/session')->getQuote();

            if ($quote->getCouponCode() !== $code) {
                $quote->setCouponCode('')->collectTotals()->save();
                $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Cupom inválido ou expirado.']));
                return;
            }

            $this->getResponse()->setBody(json_encode([
                'success'     => true,
                'coupon_code' => $code,
                'totals'      => $this->_getCouponTotals($quote),
            ]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Não foi possível aplicar o cupom.']));
        }
    }

    /**
     * Monta os totais atuais do quote para devolver ao front-end
     * depois de aplicar/remover um cupom.
     */
    protected function _getCouponTotals($quote)
    {
        $address = $quote->getShippingAddress();
        $address->setCollectShippingRates(true)->collectShippingRates();
        $quote->collectTotals();

        return [
            'subtotal'    => (float) $quote->getSubtotal(),
            'discount'    => (float) abs($address->getDiscountAmount()),
            'shipping'    => (float) $address->getShippingAmount(),
            'grand_total' => (float) $quote->getGrandTotal(),
        ];
    }

    /**
     * NOVO: persiste a alteração de quantidade de um item do carrinho.
     * Espera POST com: item_id, qty
     */
    public function updateqtyAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        if (!$this->getRequest()->isPost()) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Requisição inválida.']));
            return;
        }

        $itemId = (int) $this->getRequest()->getPost('item_id');
        $qty    = (int) $this->getRequest()->getPost('qty');

        try {
            $quote = Mage::getSingleton('checkout/session')->getQuote();
            $item  = $quote->getItemById($itemId);

            if (!$item) {
                $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Item não encontrado.']));
                return;
            }

            /* NOVO: qty <= 0 agora remove o item de fato, em vez de travar em 1 */
            if ($qty <= 0) {
                $quote->removeItem($itemId);
                $quote->getShippingAddress()->setCollectShippingRates(true);
                $quote->collectTotals()->save();

                $this->getResponse()->setBody(json_encode([
                    'success' => true,
                    'item_id' => $itemId,
                    'removed' => true,
                    'totals'  => $this->_getCouponTotals($quote),
                ]));
                return;
            }

            $item->setQty($qty);
            $quote->getShippingAddress()->setCollectShippingRates(true);
            $quote->collectTotals()->save();

            $this->getResponse()->setBody(json_encode([
                'success'   => true,
                'item_id'   => $itemId,
                'qty'       => (int) $item->getQty(),
                'row_total' => (float) $item->getRowTotal(),
                'totals'    => $this->_getCouponTotals($quote),
            ]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Não foi possível atualizar a quantidade.']));
        }
    }

    /**
     * NOVO: devolve o estado real e atual do carrinho (itens + totais).
     * Usado pelo JS após o login, pois o merge de quote (guest + cliente)
     * acontece no back-end e a tela precisa refletir isso.
     */
    public function cartAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        try {
            $block = $this->getLayout()->createBlock('ultradev_checkout/checkout');
            $items = $block->getCartItems();
            $quote = Mage::getSingleton('checkout/session')->getQuote();

            $this->getResponse()->setBody(json_encode([
                'success' => true,
                'items'   => $items,
                'totals'  => $this->_getCouponTotals($quote),
            ]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Não foi possível carregar o carrinho.']));
        }
    }

    public function loginAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        if (!$this->getRequest()->isPost()) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Requisição inválida.']));
            return;
        }

        $email = trim($this->getRequest()->getPost('email'));
        $senha = trim($this->getRequest()->getPost('senha'));

        if (!$email || !$senha) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Informe e-mail e senha.']));
            return;
        }

        try {
            $session = Mage::getSingleton('customer/session');
            $session->login($email, $senha);

            if (!$session->isLoggedIn()) {
                $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'E-mail ou senha incorretos.']));
                return;
            }

            $customer = Mage::getModel('customer/customer')->load($session->getCustomerId());
            $address  = $customer->getDefaultBillingAddress();

            $streetLines = $address ? $address->getStreet() : [];
            $street      = isset($streetLines[0]) ? $streetLines[0] : '';
            $number      = isset($streetLines[1]) ? $streetLines[1] : '';
            $complement  = isset($streetLines[2]) ? $streetLines[2] : '';
            $district    = isset($streetLines[3]) ? $streetLines[3] : '';

            $regionCode = '';
            if ($address && $address->getRegionId()) {
                $region     = Mage::getModel('directory/region')->load($address->getRegionId());
                $regionCode = $region->getCode();
            }

            // DOB formatado para DD/MM/AAAA
            $dobFormatted = '';
            if ($customer->getDob()) {
                $dobFormatted = date('d/m/Y', strtotime($customer->getDob()));
            }

            $this->getResponse()->setBody(json_encode([
                'success'  => true,
                'customer' => [
                    'firstname'          => $customer->getFirstname(),
                    'lastname'           => $customer->getLastname(),
                    'email'              => $customer->getEmail(),
                    'taxvat'             => $customer->getTaxvat(),
                    'dob'                => $dobFormatted,
                    'tipopessoa'         => $customer->getData('tipopessoa'),
                    'razao_social'       => $customer->getData('razao_social'),
                    'cpf_responsavel'    => $customer->getData('cpf_responsavel'),
                    'inscricao_estadual' => $customer->getData('inscricao_estadual'),
                    'cnpj'               => $customer->getData('cnpj'),
                    'telephone'          => $address ? $address->getTelephone() : '',
                    'postcode'           => $address ? preg_replace('/\D/', '', $address->getPostcode()) : '',
                    'street'             => $street,
                    'number'             => $number,
                    'complement'         => $complement,
                    'district'           => $district,
                    'city'               => $address ? $address->getCity() : '',
                    'region_id'          => $regionCode,
                ],
            ]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'E-mail ou senha incorretos.']));
        }
    }

    /**
     * NOVO: verifica apenas se o e-mail já pertence a um cliente cadastrado.
     * Não faz login — usado pelo JS no blur do campo de e-mail para disparar
     * o modal "Já é cliente?" com o e-mail pré-preenchido.
     */
   public function checkemailAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        $email = trim($this->getRequest()->getPost('email'));
        if (!$email || !Zend_Validate::is($email, 'EmailAddress')) {
            $this->getResponse()->setBody(json_encode(['success' => true, 'exists' => false]));
            return;
        }
        try {
            $customer = Mage::getModel('customer/customer')
                ->setWebsiteId(Mage::app()->getWebsite()->getId())
                ->loadByEmail($email);
            $this->getResponse()->setBody(json_encode([
                'success' => true,
                'exists'  => (bool) $customer->getId(),
            ]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'exists' => false]));
        }
    }

    /**
     * NOVO: encerra a sessão do cliente logado no checkout.
     * Usado pelo link "Sair" quando o cliente já autenticou via modal.
     */
    public function logoutAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');
        try {
            Mage::getSingleton('customer/session')->logout();
            $this->getResponse()->setBody(json_encode(['success' => true]));
        } catch (Exception $e) {
            $this->getResponse()->setBody(json_encode(['success' => false]));
        }
    }
}
