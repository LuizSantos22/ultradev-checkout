<?php
class UltraDev_Checkout_Model_Processor
{
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
        $email = isset($data['email']) ? trim($data['email']) : '';
        $customer = Mage::getModel('customer/customer')
            ->setWebsiteId(Mage::app()->getWebsite()->getId())
            ->loadByEmail($email);
        if ($customer->getId()) {
            $quote->setCustomer($customer);
        } else {
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
        $lastname = $this->_getField($data, $tipoPessoa === 'pf' ? 'lastname' : 'resp_sobrenome');
        $postcode = preg_replace('/\D/', '', $this->_getField($data, 'postcode'));
        $regionCode = $this->_getField($data, 'region_id');
        $regionModel = Mage::getModel('directory/region')->loadByCode($regionCode, 'BR');

        $addressData = [
            'firstname' => $firstname,
            'lastname' => $lastname,
            'street' => [
                $this->_getField($data, 'street'),
                $this->_getField($data, 'number'),
                $this->_getField($data, 'complement'),
            ],
            'city' => $this->_getField($data, 'city'),
            'region' => $regionCode,
            'region_id' => $regionModel->getId(),
            'postcode' => $postcode,
            'country_id' => 'BR',
            'telephone' => preg_replace('/\D/', '', $this->_getField($data, 'telephone')),
        ];

        $quote->getShippingAddress()->addData($addressData);
        $quote->getBillingAddress()->addData($addressData);

        $taxvat = preg_replace('/\D/', '', $this->_getField($data, $tipoPessoa === 'pf' ? 'tax_document' : 'cnpj'));
        $quote->setCustomerTaxvat($taxvat);
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

        // Campos extras são passados brutos — o gateway interpreta
        $cardFields = ['cc_number','cc_exp_month','cc_exp_year','cc_cid','cc_installments','cc_type'];
        foreach ($cardFields as $field) {
            if (isset($data[$field])) {
                $paymentData[$field] = $this->_getField($data, $field);
            }
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
