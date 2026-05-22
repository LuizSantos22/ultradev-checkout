<?php
class UltraDev_Checkout_Helper_Data extends Mage_Core_Helper_Abstract
{
    const XML_PATH_ENABLED = 'ultradev_checkout/general/enabled';

    public function isEnabled()
    {
        return Mage::getStoreConfigFlag(self::XML_PATH_ENABLED);
    }

    /**
     * Formata valor em Real
     */
    public function formatCurrency($value)
    {
        return Mage::helper('core')->currency($value, true, false);
    }
}
