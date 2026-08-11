<?php
class UltraDev_Checkout_Model_Processor
{
    /**
     * Cliente recém-criado nesta requisição, guardado aqui para ser logado
     * DEPOIS da submissão do pedido — mesma ordem que o
     * Mage_Checkout_Model_Type_Onepage::saveOrder() nativo usa
     * (submitAll() primeiro, login via _involveNewCustomer() depois).
     *
     * Importante: este objeto já sai de _setAddresses() salvo (com ID),
     * pois a criação de customer + endereço padrão agora acontece em um
     * único save(), dentro de _setAddresses() — não mais em _handleCustomer().
     */
    protected $_newCustomer = null;

    public function process(array $data)
    {
        try {
            $quote = Mage::getSingleton('checkout/session')->getQuote();
            if (!$quote || !$quote->hasItems()) {
                return ['success' => false, 'message' => $this->__('Carrinho vazio.')];
            }

            $this->_handleCustomer($quote, $data);
            $this->_setAddresses($quote, $data);
            $this->_setShipping($quote, $data);
            $this->_setPayment($quote, $data);

            $quote->collectTotals()->save();
            $service = Mage::getModel('sales/service_quote', $quote);
            $service->submitAll();
            $order = $service->getOrder();

            if (!$order || !$order->getId()) {
                Mage::throwException('Não foi possível criar o pedido.');
            }

            // Login do cliente novo acontece aqui — depois do pedido já criado,
            // na mesma requisição AJAX. Replica exatamente a ordem do
            // Mage_Checkout_Model_Type_Onepage::saveOrder() nativo:
            // submitAll() primeiro, _involveNewCustomer() (que faz o login) depois.
            if ($this->_newCustomer && $this->_newCustomer->getId()) {
                $this->_loginNewCustomer($this->_newCustomer);
            }

            // Salvar DOB diretamente no pedido após criação
            if ($quote->getCustomerDob() && $order->getId()) {
                $order->setCustomerDob($quote->getCustomerDob())->save();
            }

            // Salvar dados PJ como nota interna no pedido
            $tipoPessoa = isset($data['tipo_pessoa']) ? $data['tipo_pessoa'] : 'pf';
            if ($tipoPessoa === 'pj' && $order->getId()) {
                $cnpj        = $this->_sanitizeCnpj($this->_getField($data, 'cnpj'));
                $razaoSocial = $this->_getField($data, 'razao_social');
                $cpfResp     = preg_replace('/\D/', '', $this->_getField($data, 'tax_document_pj'));
                $ie          = $this->_getField($data, 'inscricao_estadual');

                $noteParts = ['[Dados PJ]'];
                if ($razaoSocial) $noteParts[] = 'Razão Social: ' . $razaoSocial;
                if ($cnpj)        $noteParts[] = 'CNPJ: ' . $cnpj;
                if ($cpfResp)     $noteParts[] = 'CPF do Responsável: ' . $cpfResp;
                if ($ie)          $noteParts[] = 'Inscrição Estadual: ' . $ie;

                if (count($noteParts) > 1) {
                    $order->addStatusHistoryComment(implode(' | ', $noteParts))
                        ->setIsVisibleOnFront(false)
                        ->setIsCustomerNotified(false)
                        ->save();
                }
            }

            /* Salvar comentário do cliente (campo "Comentários" do checkout) como nota do pedido */
            $orderComment = $this->_getField($data, 'order_comment');
            if ($orderComment !== '' && $order->getId()) {
                $order->addStatusHistoryComment('[Comentário do cliente] ' . $orderComment)
                    ->setIsVisibleOnFront(false)
                    ->setIsCustomerNotified(false)
                    ->save();
            }

            // NOTA: o bloco que antes recriava o endereço do customer aqui
            // (depois do pedido pronto) foi removido. O endereço padrão do
            // cliente registrado — novo ou já existente — agora é anexado
            // e salvo dentro de _setAddresses(), junto com o customer, ANTES
            // do pedido ser submetido. Isso elimina a janela em que o cliente
            // ficava sem endereço padrão vinculado durante o processamento
            // do pedido, replicando o comportamento atômico do checkout nativo.

            Mage::getSingleton('checkout/session')
                ->setLastOrderId($order->getId())
                ->setLastRealOrderId($order->getIncrementId())
                ->setLastSuccessQuoteId($quote->getId())
                ->setLastQuoteId($quote->getId());

            $quote->setIsActive(false)->save();

            return [
                'success'      => true,
                'message'      => 'Pedido criado com sucesso!',
                'order_id'     => $order->getId(),
                'increment_id' => $order->getIncrementId(),
            ];
        } catch (Exception $e) {
            Mage::logException($e);
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    protected function _handleCustomer(Mage_Sales_Model_Quote $quote, array $data)
    {
        $tipoPessoa = isset($data['tipo_pessoa']) ? $data['tipo_pessoa'] : 'pf';
        $email      = isset($data['email']) ? trim($data['email']) : '';
        $senha      = isset($data['senha']) ? trim($data['senha']) : '';

        // Preparar DOB no formato YYYY-MM-DD
        $dob = null;
        $nascimentoKey = $tipoPessoa === 'pf' ? 'nascimento_pf' : 'nascimento_pj';
        $nascimento    = $this->_getField($data, $nascimentoKey);
        if ($nascimento) {
            $parts = explode('/', $nascimento);
            if (count($parts) === 3) {
                $year  = trim($parts[2]);
                $month = trim($parts[1]);
                $day   = trim($parts[0]);
                if (checkdate((int)$month, (int)$day, (int)$year) && (int)$year > 1900) {
                    $dob = $year . '-' . str_pad($month, 2, '0', STR_PAD_LEFT) . '-' . str_pad($day, 2, '0', STR_PAD_LEFT);
                }
            }
        }

        $firstname = $this->_getField($data, $tipoPessoa === 'pf' ? 'firstname' : 'resp_nome');
        $lastname  = $this->_getField($data, $tipoPessoa === 'pf' ? 'lastname' : 'resp_sobrenome');

        $customer = Mage::getModel('customer/customer')
            ->setWebsiteId(Mage::app()->getWebsite()->getId())
            ->loadByEmail($email);

        if ($customer->getId()) {
            // Cliente já existe — associa ao quote (autenticação já feita no modal de login via loginAction).
            // DOB e endereço padrão desse cliente são tratados em _setAddresses(), no mesmo save().
            $quote->setCustomer($customer);
            if ($dob) {
                $quote->setCustomerDob($dob);
                $customer->setDob($dob);
            }
            return;
        }

        if ($senha !== '' && $senha !== 'LOGGED_IN') {
            // Senha preenchida = cliente quer se cadastrar -> monta o customer,
            // mas NÃO salva ainda. O save() único (customer + endereço padrão)
            // acontece em _setAddresses(), igual ao _prepareNewCustomerQuote()
            // nativo.
            $customer = Mage::getModel('customer/customer');
            $customer->setWebsiteId(Mage::app()->getWebsite()->getId())
                ->setStore(Mage::app()->getStore())
                ->setFirstname($firstname)
                ->setLastname($lastname)
                ->setEmail($email)
                ->setPassword($senha);

            if ($dob) {
                $customer->setDob($dob);
            }

            $quote->setCustomer($customer);
            $quote->setCustomerIsGuest(false);
            // Guarda a referência para logar DEPOIS do submitAll() em process() —
            // mesma ordem do core nativo, nunca antes do pedido ser submetido
            // e nunca num segundo request. O objeto é o mesmo que será salvo
            // (com ID preenchido) dentro de _setAddresses().
            $this->_newCustomer = $customer;
            if ($dob) {
                $quote->setCustomerDob($dob);
            }
        } else {
            // Sem senha = guest
            $quote->setCheckoutMethod(Mage_Checkout_Model_Type_Onepage::METHOD_GUEST);
            $quote->setCustomerEmail($email);
            $quote->setCustomerFirstname($firstname);
            $quote->setCustomerLastname($lastname);
            $quote->setCustomerIsGuest(true);
            if ($dob) {
                $quote->setCustomerDob($dob);
            }
        }
    }

    protected function _setAddresses(Mage_Sales_Model_Quote $quote, array $data)
    {
        $tipoPessoa = isset($data['tipo_pessoa']) ? $data['tipo_pessoa'] : 'pf';
        $firstname  = $this->_getField($data, $tipoPessoa === 'pf' ? 'firstname' : 'resp_nome');
        $lastname   = $this->_getField($data, $tipoPessoa === 'pf' ? 'lastname' : 'resp_sobrenome');
        $postcode   = preg_replace('/\D/', '', $this->_getField($data, 'postcode'));
        $regionCode = $this->_getField($data, 'region_id');
        $region     = Mage::getModel('directory/region')->loadByCode($regionCode, 'BR');
        $telephone  = preg_replace('/\D/', '', $this->_getField($data, 'telephone'));

        // CPF: apenas dígitos. CNPJ alfanumérico: letras maiúsculas + dígitos
        $rawTaxvat = $this->_getField($data, $tipoPessoa === 'pf' ? 'tax_document' : 'cnpj');
        $taxvat    = $tipoPessoa === 'pf'
            ? preg_replace('/\D/', '', $rawTaxvat)
            : $this->_sanitizeCnpj($rawTaxvat);

        $streetLines = [
            $this->_getField($data, 'street'),
            $this->_getField($data, 'number'),
            $this->_getField($data, 'complement'),
            $this->_getField($data, 'district'),
        ];

        $billingData = [
            'firstname'  => $firstname,
            'lastname'   => $lastname,
            'street'     => implode("\n", $streetLines),
            'city'       => $this->_getField($data, 'city'),
            'region'     => $regionCode,
            'region_id'  => $region->getId(),
            'postcode'   => $postcode,
            'country_id' => $this->_getField($data, 'country') ?: 'BR',
            'telephone'  => $telephone,
            'vat_id'     => $taxvat,
        ];

        $quote->getBillingAddress()->addData($billingData);
        $quote->setCustomerTaxvat($taxvat);
        $quote->setCustomerTipopessoa($tipoPessoa);

        // --- Criação/atualização atômica do customer + endereço padrão ---
        //
        // $customer aqui pode ser:
        //   a) um customer NOVO, ainda sem ID (montado em _handleCustomer,
        //      referenciado também em $this->_newCustomer); ou
        //   b) um customer JÁ EXISTENTE (com ID), carregado por e-mail.
        //
        // Em ambos os casos, o endereço de cobrança do checkout é anexado
        // como endereço padrão e tudo é salvo em UM ÚNICO save() — igual ao
        // _prepareNewCustomerQuote() nativo (que também usa um save() só,
        // com o customer + endereço padrão juntos).
        $customer = $quote->getCustomer();
        $isNewCustomer = ($this->_newCustomer !== null);

        if ($customer && ($customer->getId() || $isNewCustomer)) {
            if ($taxvat) {
                $customer->setTaxvat($taxvat);
            }

            if ($tipoPessoa === 'pj') {
                $cnpj        = $this->_sanitizeCnpj($this->_getField($data, 'cnpj'));
                $razaoSocial = $this->_getField($data, 'razao_social');
                $cpfResp     = preg_replace('/\D/', '', $this->_getField($data, 'tax_document_pj'));
                $ie          = $this->_getField($data, 'inscricao_estadual');

                if ($cnpj)        $customer->setData('cnpj', $cnpj);
                if ($razaoSocial) $customer->setData('razao_social', $razaoSocial);
                if ($cpfResp)     $customer->setData('cpf_responsavel', $cpfResp);
                if ($ie)          $customer->setData('inscricao_estadual', $ie);
                $customer->setData('tipopessoa', 'pj');
            } else {
                $customer->setData('tipopessoa', 'pf');
            }

            $customerAddress = Mage::getModel('customer/address');
            $customerAddress->setCustomer($customer)
                ->setFirstname($firstname)
                ->setLastname($lastname)
                ->setStreet($streetLines)
                ->setCity($this->_getField($data, 'city'))
                ->setRegionId($region->getId())
                ->setRegion($regionCode)
                ->setPostcode($postcode)
                ->setCountryId($this->_getField($data, 'country') ?: 'BR')
                ->setTelephone($telephone)
                ->setIsDefaultBilling(true)
                ->setIsDefaultShipping(true);

            $customer->addAddress($customerAddress);

            // ÚNICO save: customer (dados pessoais, taxvat, PJ) + endereço
            // padrão, juntos. Nenhum outro save() de customer/endereço deve
            // existir fora daqui.
            $customer->save();

            // Garante que o quote referencia o customer já salvo (mesmo
            // objeto, agora com ID preenchido) — importante para o
            // submitAll() posterior e para _loginNewCustomer() em process().
            $quote->setCustomer($customer);
        }

        // same_billing=1 significa "Entregar em endereço diferente" (checkbox marcado)
        $useAlternate = isset($data['same_billing']) && $data['same_billing'] === '1';

        if ($useAlternate) {
            $altRegionCode = $this->_getField($data, 'billing_region_id');
            $altRegion     = Mage::getModel('directory/region')->loadByCode($altRegionCode, 'BR');
            $altPostcode   = preg_replace('/\D/', '', $this->_getField($data, 'billing_postcode'));

            $shippingData = [
                'firstname'  => $firstname,
                'lastname'   => $lastname,
                'street'     => implode("\n", [
                    $this->_getField($data, 'billing_street'),
                    $this->_getField($data, 'billing_number'),
                    $this->_getField($data, 'billing_complement'),
                    $this->_getField($data, 'billing_district'),
                ]),
                'city'       => $this->_getField($data, 'billing_city'),
                'region'     => $altRegionCode,
                'region_id'  => $altRegion->getId(),
                'postcode'   => $altPostcode,
                'country_id' => $this->_getField($data, 'billing_country') ?: 'BR',
                'telephone'  => $telephone,
                'vat_id'     => $taxvat,
            ];
        } else {
            $shippingData = $billingData;
        }

        $quote->getShippingAddress()->addData($shippingData);
    }

    /**
     * Loga o cliente recém-criado, replicando
     * Mage_Checkout_Model_Type_Onepage::_involveNewCustomer(): só loga
     * automaticamente se a conta não exigir confirmação de e-mail
     * (customer/create_account/confirm desligado, ou já confirmada).
     */
    protected function _loginNewCustomer($customer)
    {
        if (!$customer->isConfirmationRequired()) {
            Mage::getSingleton('customer/session')->loginById($customer->getId());
        }
    }

    protected function _setShipping(Mage_Sales_Model_Quote $quote, array $data)
    {
        $shippingMethod = $this->_getField($data, 'shipping_method');
        if (!$shippingMethod) return;
        $shippingAddress = $quote->getShippingAddress();
        $shippingAddress->setCollectShippingRates(true)->collectShippingRates();
        $shippingAddress->setShippingMethod($shippingMethod);
    }

    protected function _setPayment(Mage_Sales_Model_Quote $quote, array $data)
    {
        $method = $this->_getField($data, 'payment_method');
        if (!$method) $method = 'checkmo';
        $paymentData = ['method' => $method];

        $cardFields = ['cc_number','cc_exp_month','cc_exp_year','cc_cid','cc_installments','cc_type'];
        foreach ($cardFields as $field) {
            if (isset($data[$field])) {
                $paymentData[$field] = $this->_getField($data, $field);
            }
        }

        // Salvar dados PJ no additional_information do pagamento
        $tipoPessoa = isset($data['tipo_pessoa']) ? $data['tipo_pessoa'] : 'pf';
        if ($tipoPessoa === 'pj') {
            $additionalInfo = [];
            $cpfResp     = preg_replace('/\D/', '', $this->_getField($data, 'tax_document_pj'));
            $razaoSocial = $this->_getField($data, 'razao_social');
            $ie          = $this->_getField($data, 'inscricao_estadual');
            if ($cpfResp)     $additionalInfo['cpf_responsavel']   = $cpfResp;
            if ($razaoSocial) $additionalInfo['razao_social']       = $razaoSocial;
            if ($ie)          $additionalInfo['inscricao_estadual'] = $ie;
            if ($additionalInfo) {
                $paymentData['additional_information'] = $additionalInfo;
            }
        }

        $quote->getPayment()->importData($paymentData);
    }

    /**
     * Sanitiza CNPJ para suportar o novo formato alfanumérico da Receita Federal.
     * Remove pontuação (pontos, barras, hífens) e preserva letras A-Z e dígitos 0-9.
     * Converte para maiúsculas para padronização.
     * Formato esperado: XX.XXX.XXX/XXXX-DD (14 caracteres sem pontuação)
     */
    protected function _sanitizeCnpj($value)
    {
        return strtoupper(preg_replace('/[^A-Z0-9]/i', '', $value));
    }

    protected function _getField(array $data, $key, $default = '')
    {
        return isset($data[$key]) ? trim($data[$key]) : $default;
    }

    protected function __($string)
    {
        return Mage::helper('ultradev_checkout')->__($string);
    }
}
