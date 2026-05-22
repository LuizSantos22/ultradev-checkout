<?php
class UltraDev_Checkout_Model_Processor
{
    /**
     * Processa o pedido com os dados recebidos do checkout
     * @param array $data POST data
     * @return array ['success' => bool, 'message' => string, 'order_id' => int|null]
     */
    public function process(array $data)
    {
        try {
            $quote = Mage::getSingleton('checkout/session')->getQuote();

            if (!$quote || !$quote->hasItems()) {
                return ['success' => false, 'message' => $this->__('Carrinho vazio.')];
            }

            // 1. Identifica/cria o cliente
            $this->_handleCustomer($quote, $data);

            // 2. Endereços
            $this->_setAddresses($quote, $data);

            // 3. Frete
            $this->_setShipping($quote, $data);

            // 4. Pagamento (placeholder — gateway real via método nativo)
            $this->_setPayment($quote, $data);

            // 5. Finaliza o pedido
            $quote->collectTotals()->save();

            /** @var Mage_Sales_Model_Service_Quote $service */
            $service = Mage::getModel('sales/service_quote', $quote);
            $service->submitAll();

            $order = $service->getOrder();

            if (!$order || !$order->getId()) {
                Mage::throwException('Não foi possível criar o pedido.');
            }

            Mage::getSingleton('checkout/session')
                ->setLastOrderId($order->getId())
                ->setLastRealOrderId($order->getIncrementId())
                ->setLastSuccessQuoteId($quote->getId())
                ->setLastQuoteId($quote->getId());

            return [
                'success'  => true,
                'message'  => 'Pedido criado com sucesso!',
                'order_id' => $order->getId(),
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

        /** @var Mage_Customer_Model_Customer $customer */
        $customer = Mage::getModel('customer/customer')
            ->setWebsiteId(Mage::app()->getWebsite()->getId())
            ->loadByEmail($email);

        if ($customer->getId()) {
            $quote->setCustomer($customer);
        } else {
            // Novo cliente — guest por padrão; pode ser convertido após o pedido
            $quote->setCheckoutMethod(Mage_Checkout_Model_Type_Onepage::METHOD_GUEST);
            $quote->setCustomerEmail($email);
            $quote->setCustomerFirstname($this->_getField($data, $tipoPessoa === 'pf' ? 'firstname' : 'resp_nome'));
            $quote->setCustomerLastname($this->_getField($data, $tipoPessoa === 'pf' ? 'lastname' : 'resp_sobrenome'));
            $quote->setCustomerIsGuest(true);
        }
    }

    protected function _setAddresses(Mage_Sales_Model_Quote $quote, array $data)
    {
        $tipoPessoa = isset($data['tipo_pessoa']) ? $data['tipo_pessoa'] : 'pf';

        $firstname = $this->_getField($data, $tipoPessoa === 'pf' ? 'firstname' : 'resp_nome');
        $lastname  = $this->_getField($data, $tipoPessoa === 'pf' ? 'lastname'  : 'resp_sobrenome');
        $postcode  = preg_replace('/\D/', '', $this->_getField($data, 'postcode'));
        $regionCode= $this->_getField($data, 'region_id');

        $regionModel = Mage::getModel('directory/region')->loadByCode($regionCode, 'BR');

        $addressData = [
            'firstname'  => $firstname,
            'lastname'   => $lastname,
            'street'     => [
                $this->_getField($data, 'street'),
                $this->_getField($data, 'number'),
                $this->_getField($data, 'complement'),
            ],
            'city'       => $this->_getField($data, 'city'),
            'region'     => $regionCode,
            'region_id'  => $regionModel->getId(),
            'postcode'   => $postcode,
            'country_id' => 'BR',
            'telephone'  => preg_replace('/\D/', '', $this->_getField($data, 'telephone')),
        ];

        // Endereço de entrega
        $shippingAddress = $quote->getShippingAddress();
        $shippingAddress->addData($addressData);

        // Endereço de faturamento (igual ao de entrega se marcado)
        $billingAddress = $quote->getBillingAddress();
        $billingAddress->addData($addressData);

        // CNPJ / CPF como atributo customizado (se existir no schema)
        if ($tipoPessoa === 'pf') {
            $taxvat = preg_replace('/\D/', '', $this->_getField($data, 'tax_document'));
        } else {
            $taxvat = preg_replace('/\D/', '', $this->_getField($data, 'cnpj'));
        }
        $quote->setCustomerTaxvat($taxvat);
    }

    protected function _setShipping(Mage_Sales_Model_Quote $quote, array $data)
    {
        $shippingMethod = $this->_getField($data, 'shipping_method');

        if (!$shippingMethod) {
            return;
        }

        $shippingAddress = $quote->getShippingAddress();
        $shippingAddress->setCollectShippingRates(true)
                        ->collectShippingRates();

        $shippingAddress->setShippingMethod($shippingMethod);
        $quote->setShippingAddress($shippingAddress);
    }

    protected function _setPayment(Mage_Sales_Model_Quote $quote, array $data)
    {
        $method = $this->_getField($data, 'payment_method');

        if (!$method) {
            $method = 'checkmo'; // fallback seguro para testes
        }

        $paymentData = ['method' => $method];

        // Cartão de crédito — passa dados brutos para o gateway instalado
        if ($method === 'card' || strpos($method, 'credit') !== false) {
            $paymentData['cc_number']      = $this->_getField($data, 'cc_number');
            $paymentData['cc_exp_month']   = $this->_getField($data, 'cc_exp_month');
            $paymentData['cc_exp_year']    = $this->_getField($data, 'cc_exp_year');
            $paymentData['cc_cid']         = $this->_getField($data, 'cc_cid');
            $paymentData['cc_installments']= $this->_getField($data, 'cc_installments');
        }

        $quote->getPayment()->importData($paymentData);
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
