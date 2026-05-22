<?php
class UltraDev_Checkout_Helper_Data extends Mage_Core_Helper_Abstract
{
    const XML_PATH_ENABLED          = 'ultradev_checkout/general/enabled';
    const XML_PATH_PIX_DISCOUNT     = 'ultradev_checkout/general/pix_discount';
    const XML_PATH_MAX_INSTALLMENTS = 'ultradev_checkout/general/max_installments';
    const XML_PATH_FREE_INSTALLMENTS= 'ultradev_checkout/general/free_installments';

    public function isEnabled()
    {
        return Mage::getStoreConfigFlag(self::XML_PATH_ENABLED);
    }

    public function getPixDiscount()
    {
        return (float) Mage::getStoreConfig(self::XML_PATH_PIX_DISCOUNT);
    }

    public function getMaxInstallments()
    {
        return (int) Mage::getStoreConfig(self::XML_PATH_MAX_INSTALLMENTS);
    }

    public function getFreeInstallments()
    {
        return (int) Mage::getStoreConfig(self::XML_PATH_FREE_INSTALLMENTS);
    }

    /**
     * Calcula as parcelas com e sem juros
     * @param float $total
     * @param float $interestRate Taxa mensal (ex: 1.99 para 1,99%)
     * @return array
     */
    public function calculateInstallments($total, $interestRate = 1.99)
    {
        $maxInstallments  = $this->getMaxInstallments();
        $freeInstallments = $this->getFreeInstallments();
        $installments     = [];

        for ($i = 1; $i <= $maxInstallments; $i++) {
            if ($i <= $freeInstallments) {
                $installments[$i] = [
                    'qty'      => $i,
                    'value'    => $total / $i,
                    'total'    => $total,
                    'interest' => false,
                ];
            } else {
                $rate  = $interestRate / 100;
                $value = ($total * $rate * pow(1 + $rate, $i)) / (pow(1 + $rate, $i) - 1);
                $installments[$i] = [
                    'qty'      => $i,
                    'value'    => $value,
                    'total'    => $value * $i,
                    'interest' => true,
                ];
            }
        }

        return $installments;
    }

    /**
     * Formata valor em Real
     */
    public function formatCurrency($value)
    {
        return Mage::helper('core')->currency($value, true, false);
    }
}
