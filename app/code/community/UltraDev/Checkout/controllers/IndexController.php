<?php
class UltraDev_Checkout_IndexController extends Mage_Core_Controller_Front_Action
{
    /**
     * Exibe o Ultra Checkout
     */
    public function indexAction()
    {
        /** @var UltraDev_Checkout_Helper_Data $helper */
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

    /**
     * Endpoint AJAX para calcular frete
     */
    public function shippingAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');

        try {
            $postcode = preg_replace('/\D/', '', $this->getRequest()->getPost('postcode'));

            if (strlen($postcode) !== 8) {
                throw new Exception('CEP inválido.');
            }

            $quote           = Mage::getSingleton('checkout/session')->getQuote();
            $shippingAddress = $quote->getShippingAddress();
            $shippingAddress->setCountryId('BR')
                            ->setPostcode($postcode)
                            ->setCollectShippingRates(true)
                            ->collectShippingRates();

            $rates = [];
            foreach ($shippingAddress->getAllShippingRates() as $rate) {
                /** @var Mage_Sales_Model_Quote_Address_Rate $rate */
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

    /**
     * Endpoint AJAX para finalizar o pedido
     */
    public function placeOrderAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');

        if (!$this->getRequest()->isPost()) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Requisição inválida.']));
            return;
        }

        $data   = $this->getRequest()->getPost();
        $result = Mage::getModel('ultradev_checkout/processor')->process($data);

        $this->getResponse()->setBody(json_encode($result));
    }

    /**
     * Endpoint AJAX para calcular parcelas
     */
    public function installmentsAction()
    {
        $this->getResponse()->setHeader('Content-type', 'application/json');

        $total        = (float) $this->getRequest()->getPost('total');
        $interestRate = (float) $this->getRequest()->getPost('interest_rate', 1.99);

        if ($total <= 0) {
            $this->getResponse()->setBody(json_encode(['success' => false, 'message' => 'Total inválido.']));
            return;
        }

        $helper       = Mage::helper('ultradev_checkout');
        $installments = $helper->calculateInstallments($total, $interestRate);

        $formatted = [];
        foreach ($installments as $i) {
            $label = $i['qty'] . 'x de ' . $helper->formatCurrency($i['value']);
            if (!$i['interest']) {
                $label .= ' sem juros';
            } else {
                $label .= ' (total ' . $helper->formatCurrency($i['total']) . ')';
            }
            $formatted[] = ['qty' => $i['qty'], 'label' => $label, 'value' => $i['value']];
        }

        $this->getResponse()->setBody(json_encode(['success' => true, 'installments' => $formatted]));
    }
}
