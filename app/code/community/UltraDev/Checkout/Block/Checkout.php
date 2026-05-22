<?php
class UltraDev_Checkout_Block_Checkout extends Mage_Core_Block_Template
{
    /**
     * Retorna os itens do carrinho formatados para o template
     */
    public function getCartItems()
    {
        $items = [];
        $quote = Mage::getSingleton('checkout/session')->getQuote();

        foreach ($quote->getAllVisibleItems() as $item) {
            /** @var Mage_Sales_Model_Quote_Item $item */
            $product  = $item->getProduct();
            $imageUrl = Mage::helper('catalog/image')->init($product, 'thumbnail')
                            ->resize(68, 68)
                            ->__toString();

            $options = [];
            if ($item->getProductType() === 'configurable') {
                foreach ($item->getProduct()->getTypeInstance(true)
                              ->getOrderOptions($item->getProduct()) as $opt) {
                    if (isset($opt['label'], $opt['value'])) {
                        $options[] = $opt['label'] . ': ' . $opt['value'];
                    }
                }
            }

            $items[] = [
                'item_id'   => $item->getId(),
                'name'      => $item->getName(),
                'qty'       => (int) $item->getQty(),
                'price'     => (float) $item->getPrice(),
                'row_total' => (float) $item->getRowTotal(),
                'image'     => $imageUrl,
                'options'   => implode(', ', $options),
            ];
        }

        return $items;
    }

    /**
     * Retorna configurações do módulo para o JS
     */
    public function getCheckoutConfig()
    {
        $helper = Mage::helper('ultradev_checkout');
        $quote  = Mage::getSingleton('checkout/session')->getQuote();

        return [
            'ajaxUrl'         => Mage::getUrl('ultradev-checkout/index/placeOrder'),
            'shippingUrl'     => Mage::getUrl('ultradev-checkout/index/shipping'),
            'installmentsUrl' => Mage::getUrl('ultradev-checkout/index/installments'),
            'pixDiscount'     => $helper->getPixDiscount(),
            'maxInstallments' => $helper->getMaxInstallments(),
            'freeInstallments'=> $helper->getFreeInstallments(),
            'subtotal'        => (float) $quote->getSubtotal(),
            'formKey'         => Mage::getSingleton('core/session')->getFormKey(),
        ];
    }

    public function getCheckoutConfigJson()
    {
        return json_encode($this->getCheckoutConfig());
    }
}
