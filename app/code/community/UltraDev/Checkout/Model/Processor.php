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

            // 4. Pagamento — delega totalmente ao gateway instalado
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

        $shippingAddress = $quote->getShippingAddress();
        $shippingAddress->addData($addressData);

        $billingAddress = $quote->getBillingAddress();
        $billingAddress->addData($addressData);

        if ($tipoPessoa === 'pf') {
            $taxvat = preg_replace('/\D/', '', $this->_getField($data, 'tax_document'));
        } else {
            $taxvat = preg_replace('/\D/',
