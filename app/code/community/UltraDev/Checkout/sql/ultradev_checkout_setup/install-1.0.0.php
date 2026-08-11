<?php
$installer = $this;
$installer->startSetup();

$attributes = [
    'tipopessoa'         => 'Tipo de Pessoa',
    'cnpj'               => 'CNPJ',
    'razao_social'       => 'Razao Social',
    'cpf_responsavel'    => 'CPF do Responsavel',
    'inscricao_estadual' => 'Inscricao Estadual',
];

foreach ($attributes as $code => $label) {
    if (!$installer->getAttribute('customer', $code, 'attribute_id')) {
        $installer->addAttribute('customer', $code, [
            'type'             => 'varchar',
            'input'            => 'text',
            'label'            => $label,
            'visible'          => 1,
            'required'         => 0,
            'user_defined'     => 1,
            'sort_order'       => 100,
            'visible_on_front' => 1,
        ]);
        Mage::getSingleton('eav/config')
            ->getAttribute('customer', $code)
            ->setData('used_in_forms', [
                'adminhtml_customer',
                'customer_account_create',
                'customer_account_edit',
                'checkout_register',
            ])
            ->save();
    }
}

$conn = $installer->getConnection();

if (!$conn->tableColumnExists($installer->getTable('sales/order'), 'customer_tipopessoa')) {
    $conn->addColumn($installer->getTable('sales/order'), 'customer_tipopessoa', [
        'type'     => Varien_Db_Ddl_Table::TYPE_TEXT,
        'length'   => 10,
        'nullable' => true,
        'default'  => null,
        'comment'  => 'Customer Tipo Pessoa',
    ]);
}

if (!$conn->tableColumnExists($installer->getTable('sales/quote'), 'customer_tipopessoa')) {
    $conn->addColumn($installer->getTable('sales/quote'), 'customer_tipopessoa', [
        'type'     => Varien_Db_Ddl_Table::TYPE_TEXT,
        'length'   => 10,
        'nullable' => true,
        'default'  => null,
        'comment'  => 'Customer Tipo Pessoa',
    ]);
}

$installer->endSetup();
