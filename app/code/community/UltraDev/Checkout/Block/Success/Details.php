<?php
class UltraDev_Checkout_Block_Success_Details extends Mage_Sales_Block_Items_Abstract
{
    protected function _construct()
    {
        parent::_construct();
        $this->setTemplate('sales/order/info.phtml');
    }

    protected function _prepareLayout()
    {
        if ($this->getOrder()) {
            $this->setChild(
                'payment_info',
                $this->helper('payment')->getInfoBlock($this->getOrder()->getPayment())
            );
        }
    }

    public function getPaymentInfoHtml()
    {
        return $this->getChildHtml('payment_info');
    }

    public function getOrder()
    {
        return Mage::getSingleton('checkout/session')->getLastRealOrder();
    }

    public function getCanViewOrder()
    {
        return Mage::getSingleton('customer/session')->isLoggedIn();
    }

    public function getViewOrderUrl()
    {
        $order = $this->getOrder();
        if ($order && $order->getId()) {
            return Mage::getUrl('sales/order/view', array('order_id' => $order->getId()));
        }
        return '';
    }
}
