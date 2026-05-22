<?php
class UltraDev_Checkout_Model_Observer
{
    /**
     * Intercepta o acesso ao checkout padrão e redireciona para o Ultra Checkout
     */
    public function redirectToUltraCheckout(Varien_Event_Observer $observer)
    {
        /** @var UltraDev_Checkout_Helper_Data $helper */
        $helper = Mage::helper('ultradev_checkout');

        if (!$helper->isEnabled()) {
            return $this;
        }

        $quote = Mage::getSingleton('checkout/session')->getQuote();

        if (!$quote || !$quote->hasItems()) {
            return $this;
        }

        /** @var Mage_Core_Controller_Request_Http $request */
        $request = $observer->getEvent()->getControllerAction()->getRequest();

        // Evita loop de redirecionamento
        if ($request->getModuleName() === 'ultradev-checkout') {
            return $this;
        }

        $url = Mage::getUrl('ultradev-checkout');
        Mage::app()->getResponse()->setRedirect($url)->sendResponse();
        exit;
    }
}
