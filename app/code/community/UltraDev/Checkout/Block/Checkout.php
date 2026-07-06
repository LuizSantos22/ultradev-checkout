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
     * Retorna os métodos de pagamento ativos do OpenMage
     */
    public function getPaymentMethods()
    {
        $quote   = Mage::getSingleton('checkout/session')->getQuote();
        $store   = $quote->getStoreId();
        $methods = [];
        try {
            $availableMethods = Mage::helper('payment')->getStoreMethods($store, $quote);
        } catch (Exception $e) {
            return $methods;
        }
        foreach ($availableMethods as $method) {
            if (!$method->canUseCheckout()) {
                continue;
            }
            try {
                $block = Mage::getBlockSingleton($method->getFormBlockType());
                if ($block) {
                    $block->setMethod($method)->setQuote($quote);
                    $html = $block->toHtml();
                } else {
                    $html = '';
                }
            } catch (Exception $e) {
                $html = '';
            }
            $methods[] = [
                'code'  => $method->getCode(),
                'title' => (string) $method->getTitle(),
                'block' => $html,
            ];
        }
        return $methods;
    }

    /**
     * Retorna todas as regiões agrupadas por país para o JS
     */
    protected function _getAllRegions()
    {
        $collection = Mage::getModel('directory/region')->getCollection()->load();
        $regions = [];
        foreach ($collection as $region) {
            $regions[$region->getCountryId()][] = [
                'id'   => $region->getId(),
                'code' => $region->getCode(),
                'name' => $region->getName(),
            ];
        }
        return $regions;
    }

    /**
     * Retorna configurações do módulo para o JS
     */
    public function getCheckoutConfig()
    {
        $helper   = Mage::helper('ultradev_checkout');
        $quote    = Mage::getSingleton('checkout/session')->getQuote();
        $session  = Mage::getSingleton('customer/session');
        $customer = null;

        if ($session->isLoggedIn()) {
            $c       = Mage::getModel('customer/customer')->load($session->getCustomerId());
            $address = $c->getDefaultBillingAddress();

            $streetLines = $address ? $address->getStreet() : [];
            $regionCode  = '';
            if ($address && $address->getRegionId()) {
                $region     = Mage::getModel('directory/region')->load($address->getRegionId());
                $regionCode = $region->getCode();
            }

            $dobFormatted = '';
            if ($c->getDob()) {
                $dobFormatted = date('d/m/Y', strtotime($c->getDob()));
            }

            $customer = [
                'firstname'          => $c->getFirstname(),
                'lastname'           => $c->getLastname(),
                'email'              => $c->getEmail(),
                'taxvat'             => $c->getTaxvat(),
                'dob'                => $dobFormatted,
                'telephone'          => $address ? $address->getTelephone() : '',
                'postcode'           => $address ? preg_replace('/\D/', '', $address->getPostcode()) : '',
                'street'             => isset($streetLines[0]) ? $streetLines[0] : '',
                'number'             => isset($streetLines[1]) ? $streetLines[1] : '',
                'complement'         => isset($streetLines[2]) ? $streetLines[2] : '',
                'district'           => isset($streetLines[3]) ? $streetLines[3] : '',
                'city'               => $address ? $address->getCity() : '',
                'region_id'          => $regionCode,
                'tipopessoa'         => $c->getData('tipopessoa'),
                'cnpj'               => $c->getData('cnpj'),
                'razao_social'       => $c->getData('razao_social'),
                'cpf_responsavel'    => $c->getData('cpf_responsavel'),
                'inscricao_estadual' => $c->getData('inscricao_estadual'),
            ];
        }

        return [
            'ajaxUrl'          => Mage::getUrl('ultra-checkout/index/placeOrder'),
            'shippingUrl'      => Mage::getUrl('ultra-checkout/index/shipping'),
            'installmentsUrl'  => Mage::getUrl('ultra-checkout/index/installments'),
            'loginUrl'         => Mage::getUrl('ultra-checkout/index/login'),
            'pixDiscount'      => $helper->getPixDiscount(),
            'maxInstallments'  => $helper->getMaxInstallments(),
            'freeInstallments' => $helper->getFreeInstallments(),
            'subtotal'         => (float) $quote->getSubtotal(),
            'formKey'          => Mage::getSingleton('core/session')->getFormKey(),
            'regions'          => $this->_getAllRegions(),
            'customer'         => $customer,
        ];
    }

   public function getCheckoutConfigJson()
    {
        return json_encode($this->getCheckoutConfig());
    }

    public function isCustomerLoggedIn()
    {
        return Mage::getSingleton('customer/session')->isLoggedIn();
    }
}
