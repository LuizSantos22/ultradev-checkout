var UltraCheckout = (function () {
    'use strict';
    var CIRCUM = 119.4;
    var tipoPessoa = 'pf';
    var currentPaymentMethod = null;
    var currentShippingPrice = null;
    var currentShippingName = '';
    var appliedDiscountAmount = 0;
    var pulseTimeout;
    var emailCheckTimeout;
    var lastCheckedEmail = '';
    var isLoggedIn = false; /* NOVO: reflete se o cliente já autenticou no checkout */
    var config = window.UltraCheckoutConfig || {};

    function setRing(id, pct, green) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.strokeDashoffset = CIRCUM * (1 - Math.min(pct, 1));
        el.style.stroke = green ? '#28a745' : '#2c85c8';
    }
    function setStep(n, state) {
        var s = document.getElementById('tl-s' + n);
        if (!s) return;
        s.className = 'tl-step' + (state !== 'idle' ? ' ' + state : '');
    }
    function setLabel(n, text) {
        var s = document.getElementById('tl-s' + n);
        if (!s) return;
        var label = s.querySelector('.tl-label');
        if (label && label.textContent !== text) label.textContent = text;
    }
    function setIcon(n, iconClass) {
        var s = document.getElementById('tl-s' + n);
        if (!s) return;
        var icon = s.querySelector('.tl-dot i');
        if (icon) icon.className = 'ti ' + iconClass;
    }
    function setFill(n, pct, green) {
        var el = document.getElementById('tl-fill' + n);
        if (!el) return;
        el.style.width = Math.min(pct * 100, 100) + '%';
        el.style.background = green ? '#28a745' : '#2c85c8';
    }
    function updateTimeline(p1, p2, p3, finalized) {
        var s1done = p1 >= 1, s2done = p2 >= 1, s3done = p3 >= 1;
        if (finalized) { setStep(1,'done-green'); setRing('tl-ring1',1,true); }
        else if (s1done) { setStep(1,'done'); setRing('tl-ring1',1,false); }
        else if (p1 > 0) { setStep(1,'partial'); setRing('tl-ring1',p1,false); }
        else { setStep(1,'active'); setRing('tl-ring1',0,false); }
        setFill(1, s1done ? 1 : 0, finalized);
        if (finalized) { setStep(2,'done-green'); setRing('tl-ring2',1,true); }
        else if (s2done) { setStep(2,'done'); setRing('tl-ring2',1,false); }
        else if (s1done && p2>0) { setStep(2,'partial'); setRing('tl-ring2',p2,false); }
        else if (s1done) { setStep(2,'active'); setRing('tl-ring2',0,false); }
        else { setStep(2,'idle'); setRing('tl-ring2',0,false); }
        setFill(2, s2done ? 1 : 0, finalized);

        if (p2 >= 0.5) {
            setLabel(2, 'Pagamento');
            setIcon(2, 'ti-credit-card');
        } else {
            setLabel(2, 'Entrega');
            setIcon(2, 'ti-truck');
        }
        if (finalized) { setStep(3,'done-green'); setRing('tl-ring3',1,true); }
        else if (s3done) { setStep(3,'done'); setRing('tl-ring3',1,false); }
        else if (s2done && p3>0) { setStep(3,'partial'); setRing('tl-ring3',p3,false); }
        else if (s2done) { setStep(3,'active'); setRing('tl-ring3',0,false); }
        else { setStep(3,'idle'); setRing('tl-ring3',0,false); }
        setFill(3, s3done ? 1 : 0, finalized);
    }
    function handlePulseAnimation(p1, p2, p3, finalized) {
        if (pulseTimeout) clearTimeout(pulseTimeout);
        ['tl-dot1','tl-dot2','tl-dot3'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.animation = '';
        });
        function pulse(id, color) {
            var el = document.getElementById(id);
            if (el) el.style.animation = 'pulse-' + color + ' 2s ease-out infinite';
        }
        if (finalized) {
            ['tl-dot1','tl-dot2','tl-dot3'].forEach(function(id){ pulse(id,'green'); });
            pulseTimeout = setTimeout(function() {
                ['tl-dot1','tl-dot2','tl-dot3'].forEach(function(id){
                    var el = document.getElementById(id);
                    if (el) el.style.animation = '';
                });
            }, 4000);
        } else if (p2 >= 1) { pulse('tl-dot3','blue'); }
        else if (p1 >= 1) { pulse('tl-dot2','blue'); }
        else { pulse('tl-dot1','blue'); }
    }
    function calcProgress() {
        var email = val('email'), senha = val('senha');
        var nome = tipoPessoa === 'pf' ? val('firstname') : val('resp_nome');
        var sob = tipoPessoa === 'pf' ? val('lastname') : val('resp_sobrenome');
        var tax = tipoPessoa === 'pf' ? digits('tax_document') : alphaNum('cnpj');
        var taxMin = tipoPessoa === 'pf' ? 11 : 14;
        var tel = digits('telephone'), cep = digits('postcode');
        var rua = val('street'), num = val('number');
        var s1fields = [email?1:0, senha?1:0, nome?1:0, sob?1:0, (tax.length>=taxMin)?1:0, (tel.length>=10)?1:0, (cep.length>=8)?1:0, rua?1:0, num?1:0];
        var p1 = s1fields.reduce(function(a,b){return a+b;},0)/s1fields.length;
        var hasShipping = document.querySelector('.shipping-methods .outlined-card.active') ? 1 : 0;
        var hasPayment = document.querySelector('.payment-methods .outlined-card.active') ? 1 : 0;
        var p2 = 0;
        if (hasShipping) p2 = 0.5;
        if (hasPayment) p2 = 1.0;
        return { p1: p1, p2: p2, p3: 0 };
    }
    function refreshTimeline(finalized) {
        finalized = finalized || false;
        var prog = calcProgress();
        updateTimeline(prog.p1, prog.p2, prog.p3, finalized);
        handlePulseAnimation(prog.p1, prog.p2, prog.p3, finalized);
    }
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function digits(id) { var el = document.getElementById(id); return el ? el.value.replace(/\D/g,'') : ''; }
    function alphaNum(id) { var el = document.getElementById(id); return el ? el.value.replace(/[^A-Z0-9]/gi,'') : ''; }
    function fmt(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

    /* NOVO: escapa texto vindo do servidor antes de injetar via innerHTML */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    /* NOVO: monta o markup de um item do resumo a partir dos dados reais do quote */
    function buildSummaryItemHtml(item) {
        return '' +
            '<div class="summary-item" data-item-id="' + item.item_id + '">' +
                '<img class="summary-thumb" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '">' +
                '<div class="summary-content">' +
                    '<div class="summary-row-top">' +
                        '<span class="summary-name">' + escapeHtml(item.name) + '</span>' +
                        '<span class="summary-price" id="item-total-' + item.item_id + '">' + fmt(item.row_total) + '</span>' +
                    '</div>' +
                    '<div class="summary-row-bottom">' +
                        '<span class="summary-var">' + escapeHtml(item.options) + '</span>' +
                        '<div class="usc-qty-wrap">' +
                            '<button type="button" class="usc-qty-btn" onclick="UltraCheckout.updateQty(this,-1)">−</button>' +
                            '<input class="usc-qty" type="text" value="' + item.qty + '" data-price="' + item.price + '" data-target="item-total-' + item.item_id + '" readonly>' +
                            '<button type="button" class="usc-qty-btn" onclick="UltraCheckout.updateQty(this,1)">+</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    /* NOVO: busca o estado real do carrinho no back-end e reconstrói o resumo.
       Necessário porque o merge de quote (guest + cliente) acontece no
       back-end no momento do login, e a tela até então mostra dados obsoletos. */
    function refreshCartSummary(callback) {
        var container = document.querySelector('.summary-items');
        if (!container || !config.cartUrl) { if (callback) callback(); return; }

        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.cartUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.success && data.items) {
                container.innerHTML = data.items.map(buildSummaryItemHtml).join('');
                calculateTotals();
                if (data.totals) applyServerTotals(data.totals);
            }
            if (callback) callback();
        })
        .catch(function() { if (callback) callback(); });
    }

    /* NOVO: valida dígito verificador real do CPF (bloqueia sequências como 111.111.111-11) */
    function isValidCPF(cpf) {
        cpf = (cpf || '').replace(/\D/g, '');
        if (cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

        var sum = 0, i, rest;
        for (i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
        rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        if (rest !== parseInt(cpf.substring(9, 10), 10)) return false;

        sum = 0;
        for (i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
        rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        if (rest !== parseInt(cpf.substring(10, 11), 10)) return false;

        return true;
    }

    /* NOVO: valida se a data (DD/MM/AAAA) é real, não é futura e representa idade plausível (>=16 anos) */
    function isValidBirthDate(value) {
        var parts = (value || '').split('/');
        if (parts.length !== 3) return false;
        var day = parseInt(parts[0], 10), month = parseInt(parts[1], 10), year = parseInt(parts[2], 10);
        if (!day || !month || !year || year < 1900) return false;

        var date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
        if (date > new Date()) return false;

        var age = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= 16;
    }

    /* NOVO: aplica/remove classe visual de erro em um campo + mensagem de aviso */
    function setFieldValidity(id, isValid, message) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('field-invalid', !isValid);

        var errorEl = document.getElementById(id + '-error');
        if (!errorEl) {
            errorEl = document.createElement('span');
            errorEl.id = id + '-error';
            errorEl.className = 'field-error-msg';
            var wrapper = el.closest('.fl') || el.parentElement;
            if (wrapper) wrapper.appendChild(errorEl);
        }

        if (!isValid) {
            errorEl.textContent = message || 'Valor inválido.';
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
    }

    /* NOVO: dispara validação de CPF ao sair do campo */
    function validateCpfField(id) {
        var raw = digits(id);
        if (raw.length === 11) {
            setFieldValidity(id, isValidCPF(raw), 'CPF inválido. Verifique o número informado.');
        } else {
            setFieldValidity(id, true); // não valida enquanto incompleto
        }
    }

    /* NOVO: dispara validação de data ao sair do campo */
    function validateBirthDateField(id) {
        var raw = val(id);
        if (raw.length === 10) {
            setFieldValidity(id, isValidBirthDate(raw), 'Data de nascimento inválida.');
        } else {
            setFieldValidity(id, true);
        }
    }

    /* NOVO: verifica no backend se o e-mail já é de um cliente cadastrado */
    function checkEmailExists(email) {
        if (!config.checkEmailUrl || email === lastCheckedEmail) return;
        lastCheckedEmail = email;

        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.checkEmailUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'email=' + encodeURIComponent(email) + '&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.success && data.exists) {
                openLoginModal(email);
            }
        })
        .catch(function() {});
    }

    function switchType(type) {
        tipoPessoa = type;
        document.querySelectorAll('.tp-btn').forEach(function(btn){ btn.classList.toggle('on', btn.dataset.type === type); });
        document.getElementById('bloco-pf').classList.toggle('hidden', type !== 'pf');
        document.getElementById('bloco-pj').classList.toggle('hidden', type !== 'pj');
        refreshTimeline();
    }
    function handleInputState(el) { el.value.trim() ? el.classList.add('has') : el.classList.remove('has'); }
    function fmtData(e) { var v = e.value.replace(/\D/g,''); e.value = v.replace(/^(\d{2})(\d)/,'$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/,'$1/$2/$3'); }
    function fmtCpf(e) { var v = e.value.replace(/\D/g,''); e.value = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }

    function fmtCnpj(e) {
        var raw = e.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
        var v = '';
        if (raw.length > 12) {
            v = raw.slice(0,2) + '.' + raw.slice(2,5) + '.' + raw.slice(5,8) + '/' + raw.slice(8,12) + '-' + raw.slice(12);
        } else if (raw.length > 8) {
            v = raw.slice(0,2) + '.' + raw.slice(2,5) + '.' + raw.slice(5,8) + '/' + raw.slice(8);
        } else if (raw.length > 5) {
            v = raw.slice(0,2) + '.' + raw.slice(2,5) + '.' + raw.slice(5);
        } else if (raw.length > 2) {
            v = raw.slice(0,2) + '.' + raw.slice(2);
        } else {
            v = raw;
        }
        e.value = v;
    }

    function fmtTel(e) { var v = e.value.replace(/\D/g,''); e.value = v.length > 10 ? v.replace(/^(\d{2})(\d{5})(\d)/,'($1) $2-$3') : v.replace(/^(\d{2})(\d{4})(\d)/,'($1) $2-$3'); }
    function fmtCep(e) { var v = e.value.replace(/\D/g,''); e.value = v.replace(/^(\d{5})(\d)/,'$1-$2'); }

    function toggleBilling(checkbox) {
        var wrapper = document.getElementById('billing-address-wrapper');
        if (wrapper) wrapper.style.display = checkbox.checked ? 'block' : 'none';
    }

    function checkCepDisplay(element) {
        var raw = element.value.replace(/\D/g,'');
        var wrapper = document.getElementById('address-fields-wrapper');
        if (!wrapper) return;
        if (raw.length === 8) { wrapper.style.display = 'block'; fetchCepData(raw); fetchShippingRates(raw); }
        else { wrapper.style.display = 'none'; }
    }

    function fetchCepData(cep) {
        fetch('https://viacep.com.br/ws/' + cep + '/json/')
            .then(function(r){ return r.json(); })
            .then(function(data) {
                if (!data.erro) {
                    setField('street', data.logradouro);
                    setField('district', data.bairro);
                    setField('city', data.localidade);
                    if (data.uf) {
                        var sel = document.getElementById('region_id');
                        if (sel) { sel.value = data.uf; sel.classList.add('has'); }
                    }
                    var numEl = document.getElementById('number');
                    if (numEl) numEl.focus();
                    refreshTimeline();
                }
            }).catch(function(){});
    }

    function checkBillingCep(element) {
        var raw = element.value.replace(/\D/g,'');
        if (raw.length === 8) {
            fetch('https://viacep.com.br/ws/' + raw + '/json/')
                .then(function(r){ return r.json(); })
                .then(function(data) {
                    if (!data.erro) {
                        setField('billing_street', data.logradouro);
                        setField('billing_district', data.bairro);
                        setField('billing_city', data.localidade);
                        if (data.uf) {
                            var sel = document.getElementById('billing_region_id');
                            if (sel) { sel.value = data.uf; sel.classList.add('has'); }
                        }
                        var numEl = document.getElementById('billing_number');
                        if (numEl) numEl.focus();
                    }
                }).catch(function(){});
        }
    }

    function setField(id, value) {
        var el = document.getElementById(id);
        if (el && value) { el.value = value; el.classList.add('has'); }
    }

    function fetchShippingRates(cep) {
        var container = document.getElementById('shipping-methods-container');
        if (!container) return;
        container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Calculando fretes...</p>';
        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.shippingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'postcode=' + encodeURIComponent(cep) + '&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            container.innerHTML = '';
            if (!data.success || !data.rates || data.rates.length === 0) {
                container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Nenhuma opção de frete disponível para este CEP.</p>';
                return;
            }
            data.rates.forEach(function(rate) {
                var price = rate.price > 0 ? fmt(rate.price) : 'Grátis';
                var card = document.createElement('div');
                card.className = 'outlined-card';
                card.setAttribute('data-shipping-code', rate.code);
                card.setAttribute('onclick', 'UltraCheckout.selectShipping(this,' + rate.price + ',"' + rate.title + '")');
                card.innerHTML = '<div class="outlined-head"><div><div class="outlined-label">' + rate.title + '</div></div><div style="display:flex;align-items:center;gap:12px;"><span class="outlined-price">' + price + '</span><div class="radio"><div class="radio-dot"></div></div></div></div>';
                container.appendChild(card);
            });
            calculateTotals();
        }).catch(function() {
            if (container) container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Erro ao calcular frete.</p>';
        });
    }

    function selectShipping(element, price, name) {
        document.querySelectorAll('.shipping-methods .outlined-card').forEach(function(c){ c.classList.remove('active'); });
        element.classList.add('active');
        currentShippingPrice = price; currentShippingName = name;
        calculateTotals(); refreshTimeline();
    }
    function selectPayment(element, method) {
        document.querySelectorAll('.payment-methods .outlined-card').forEach(function(c) {
            c.classList.remove('active');
            var body = c.querySelector('.payment-body');
            if (body) body.style.display = 'none';
        });
        element.classList.add('active');
        var body = element.querySelector('.payment-body');
        if (body) body.style.display = 'block';
        currentPaymentMethod = method;
        calculateTotals(); refreshTimeline();
    }

    var appliedCouponCode = null;
    var savedComment = '';        /* NOVO: comentário fica só em memória até o placeOrder */
    var couponMsgTimeout;         /* NOVO: controla o fade da mensagem temporária */
    var REMOVE_COLOR = '#b73741';

    function showCouponMsg(text, isError, isRemoval) {
        var el = document.getElementById('coupon-msg');
        if (el) {
            el.textContent = text;
            el.style.color = (isError || isRemoval) ? REMOVE_COLOR : 'var(--success)';
            el.style.display = 'block';
            el.style.opacity = '1';
            clearTimeout(couponMsgTimeout);
            couponMsgTimeout = setTimeout(function() { el.style.opacity = '0'; }, 2000);
        }

        /* NOVO: reflete o resultado no botão toggle e volta ao estado padrão */
        var couponBtn = document.getElementById('btn-toggle-coupon');
        if (couponBtn) {
            couponBtn.classList.remove('active', 'error');
            if (isRemoval) {
                // fica cinza padrão (sem cupom aplicado)
            } else if (isError) {
                couponBtn.classList.add('error');
            } else if (appliedCouponCode) {
                couponBtn.classList.add('active');
            }
        }
        showToggleRow();
    }

    function applyServerTotals(totals) {
        if (!totals) return;
        appliedDiscountAmount = totals.discount || 0;
        var row = document.getElementById('discount-row');
        if (row) row.style.display = appliedDiscountAmount > 0 ? '' : 'none';
        var label = document.getElementById('discount-label');
        if (label) label.textContent = appliedCouponCode ? ('Desconto — Cupom (' + appliedCouponCode + ')') : 'Desconto';
        var elSub = document.getElementById('subtotal-val');
        var elDiscount = document.getElementById('discount-val');
        var elTotal = document.getElementById('total-val');
        if (elSub) elSub.textContent = fmt(totals.subtotal);
        if (elDiscount) elDiscount.textContent = '−' + fmt(appliedDiscountAmount);
        if (elTotal) elTotal.textContent = fmt(totals.grand_total);
    }

    function syncQtyWithServer(itemId, qty) {
        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.updateQtyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'item_id=' + encodeURIComponent(itemId) + '&qty=' + encodeURIComponent(qty) + '&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.success) applyServerTotals(data.totals);
        })
        .catch(function() {});
    }

    function updateQty(btn, change) {
        var inp = btn.closest('.usc-qty-wrap').querySelector('.usc-qty');
        var current = parseInt(inp.value);
        var itemId = (inp.dataset.target || '').replace('item-total-', '');

        if (change < 0 && current <= 1) {
            var item = btn.closest('.summary-item');
            var name = item ? (item.querySelector('.summary-name') ? item.querySelector('.summary-name').textContent.trim() : 'este produto') : 'este produto';
            showRemoveConfirm(name, function() {
                syncQtyWithServer(itemId, 0);
                if (item) {
                    item.style.transition = 'opacity 0.3s';
                    item.style.opacity = '0';
                    setTimeout(function() {
                        item.remove();
                        calculateTotals();
                    }, 300);
                }
            });
            return;
        }
        var newQty = Math.max(1, current + change);
        inp.value = newQty;
        calculateTotals();
        syncQtyWithServer(itemId, newQty);
    }

    function showRemoveConfirm(productName, onConfirm) {
        var existing = document.getElementById('usc-remove-modal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'usc-remove-modal';
        modal.className = 'usc-remove-modal-overlay';
        modal.innerHTML = '<div class="usc-remove-modal-box">' +
            '<div class="usc-remove-modal-icon"><i class="ti ti-trash"></i></div>' +
            '<p class="usc-remove-modal-title">Remover produto?</p>' +
            '<p class="usc-remove-modal-text">' + escapeHtml(productName) + ' será removido do seu pedido.</p>' +
            '<div class="usc-remove-modal-actions">' +
            '<button id="usc-remove-cancel" class="usc-remove-modal-btn usc-remove-modal-btn--cancel">Cancelar</button>' +
            '<button id="usc-remove-confirm" class="usc-remove-modal-btn usc-remove-modal-btn--confirm">Remover</button>' +
            '</div></div>';

        document.body.appendChild(modal);

        document.getElementById('usc-remove-cancel').onclick = function() { modal.remove(); };
        document.getElementById('usc-remove-confirm').onclick = function() { modal.remove(); onConfirm(); };
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    }

    function applyCoupon() {
        var codeEl = document.getElementById('coupon_code');
        var code = codeEl.value.trim();
        if (code === '') return;

        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.couponUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'coupon_action=apply&coupon_code=' + encodeURIComponent(code) + '&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (!data.success) {
                appliedCouponCode = null;
                appliedDiscountAmount = 0;
                showCouponMsg(data.message || 'Cupom inválido ou expirado.', true);
                calculateTotals();
                return;
            }
            appliedCouponCode = data.coupon_code;
            showCouponMsg('Cupom "' + data.coupon_code + '" aplicado com sucesso!', false);
            applyServerTotals(data.totals);
        })
        .catch(function() { showCouponMsg('Não foi possível aplicar o cupom. Tente novamente.', true); });
    }

    function removeCoupon() {
        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.couponUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'coupon_action=remove&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            appliedCouponCode = null;
            showCouponMsg('Cupom removido.', false, true);
            if (data && data.totals) applyServerTotals(data.totals);
        })
        .catch(function() {});
    }

	/* NOVO: bloco cupom/comentários — camada de UI por cima da lógica existente */

    function setActionButtonMode(btn, mode) {
        if (!btn) return;
        if (mode === 'remover') {
            btn.textContent = 'Remover';
            btn.style.background = REMOVE_COLOR;
        } else {
            btn.textContent = mode;
            btn.style.background = '';
        }
    }

    function paintToggleButtons() {
        var couponBtn = document.getElementById('btn-toggle-coupon');
        var commentBtn = document.getElementById('btn-toggle-comment');
        if (couponBtn) couponBtn.classList.toggle('active', !!appliedCouponCode);
        if (commentBtn) commentBtn.classList.toggle('active', !!savedComment);
    }

    function showToggleRow() {
        var couponRow = document.getElementById('coupon-row');
        var commentRow = document.getElementById('comment-row');
        var toggleRow = document.getElementById('cc-toggle-row');
        if (couponRow) couponRow.style.display = 'none';
        if (commentRow) commentRow.style.display = 'none';
        if (toggleRow) toggleRow.style.display = 'flex';
        paintToggleButtons();
    }

    function toggleCouponRow() {
        var row = document.getElementById('coupon-row');
        var toggleRow = document.getElementById('cc-toggle-row');
        var commentRow = document.getElementById('comment-row');
        var actionBtn = document.getElementById('btn-coupon-action');
        var codeEl = document.getElementById('coupon_code');
        if (commentRow) commentRow.style.display = 'none';

        if (appliedCouponCode) {
            setActionButtonMode(actionBtn, 'remover');
            if (codeEl) codeEl.value = appliedCouponCode;
        } else {
            setActionButtonMode(actionBtn, 'Aplicar');
        }

        if (toggleRow) toggleRow.style.display = 'none';
        if (row) row.style.display = 'grid';
        if (codeEl) codeEl.focus();
    }

    function toggleCommentRow() {
        var row = document.getElementById('comment-row');
        var toggleRow = document.getElementById('cc-toggle-row');
        var couponRow = document.getElementById('coupon-row');
        var actionBtn = document.getElementById('btn-comment-action');
        var commentEl = document.getElementById('order_comment');
        if (couponRow) couponRow.style.display = 'none';

        if (savedComment) {
            setActionButtonMode(actionBtn, 'remover');
            if (commentEl) commentEl.value = savedComment;
        } else {
            setActionButtonMode(actionBtn, 'Salvar');
            if (commentEl) commentEl.value = '';
        }

        if (toggleRow) toggleRow.style.display = 'none';
        if (row) row.style.display = 'grid';
        if (commentEl) commentEl.focus();
    }

    /* Decide se chama applyCoupon() ou removeCoupon() — a lógica em si não muda */
    function handleCouponAction() {
        var btn = document.getElementById('btn-coupon-action');
        if (btn && btn.textContent.trim() === 'Remover') {
            removeCoupon();
        } else {
            applyCoupon();
        }
    }

    function showCommentMsg(text, isRemoval) {
        var el = document.getElementById('coupon-msg');
        if (!el) return;
        el.textContent = text;
        el.style.color = isRemoval ? REMOVE_COLOR : 'var(--success)';
        el.style.display = 'block';
        el.style.opacity = '1';
        clearTimeout(couponMsgTimeout);
        couponMsgTimeout = setTimeout(function() { el.style.opacity = '0'; }, 2000);
    }

    /* NOVO: comentário só fica em memória — nada é enviado ao backend aqui */
    function handleCommentAction() {
        var btn = document.getElementById('btn-comment-action');
        var input = document.getElementById('order_comment');

        if (btn && btn.textContent.trim() === 'Remover') {
            savedComment = '';
            if (input) input.value = '';
            showCommentMsg('Comentário removido', true);
            showToggleRow();
            return;
        }

        var text = input ? input.value.trim() : '';
        if (text === '') {
            showToggleRow();
            return;
        }
        savedComment = text;
        showCommentMsg('Comentário salvo', false);
        showToggleRow();
    }
	
    function calculateTotals() {
        var sub = 0;
        document.querySelectorAll('.usc-qty').forEach(function(inp) {
            var qty = parseInt(inp.value) || 1, unit = parseFloat(inp.dataset.price) || 0, tot = qty * unit;
            sub += tot;
            var target = document.getElementById(inp.dataset.target);
            if (target) target.textContent = fmt(tot);
        });
        var freight = currentShippingPrice !== null ? currentShippingPrice : 0;
        var total = Math.max(0, sub + freight - appliedDiscountAmount);
        var elSub = document.getElementById('subtotal-val');
        var elShip = document.getElementById('shipping-val');
        var elShipName = document.getElementById('shipping-label-name');
        var elDiscountRow = document.getElementById('discount-row');
        var elDiscount = document.getElementById('discount-val');
        var elTotal = document.getElementById('total-val');
        if (elSub) elSub.textContent = fmt(sub);
        if (elShip) elShip.textContent = currentShippingPrice !== null ? fmt(freight) : '—';
        if (elShipName) elShipName.textContent = currentShippingName ? 'Frete (' + currentShippingName + ')' : 'Frete';
        if (elDiscountRow) elDiscountRow.style.display = appliedDiscountAmount > 0 ? '' : 'none';
        if (elDiscount) elDiscount.textContent = '−' + fmt(appliedDiscountAmount);
        if (elTotal) elTotal.textContent = fmt(total);
    }

    function finalizeOrder() {
        var btn = document.getElementById('btn-finalize');
        if (!btn || btn.disabled) return;

        /* NOVO: bloqueia envio se CPF ou data de nascimento estiverem marcados como inválidos */
        var cpfFieldId = tipoPessoa === 'pf' ? 'tax_document' : 'tax_document_pj';
        var dobFieldId = tipoPessoa === 'pf' ? 'nascimento_pf' : 'nascimento_pj';
        var cpfEl = document.getElementById(cpfFieldId);
        var dobEl = document.getElementById(dobFieldId);

        if (cpfEl && cpfEl.classList.contains('field-invalid')) {
            alert('CPF inválido. Verifique o número informado.');
            cpfEl.focus();
            return;
        }
        if (dobEl && dobEl.classList.contains('field-invalid')) {
            alert('Data de nascimento inválida.');
            dobEl.focus();
            return;
        }

        var sameBillingEl = document.getElementById('same_billing');
        var useAlternate = sameBillingEl && sameBillingEl.checked;

        var fields = [
            'email','senha','firstname','lastname','tax_document','nascimento_pf',
            'resp_nome','resp_sobrenome','tax_document_pj','nascimento_pj',
            'cnpj','inscricao_estadual','razao_social',
            'telephone','postcode','street','number','complement','district','city',
            'region_id','country','coupon_code'
        ];

        if (useAlternate) {
            fields = fields.concat([
                'billing_postcode','billing_street','billing_number','billing_complement',
                'billing_district','billing_city','billing_region_id','billing_country'
            ]);
        }

        var formKeyEl = document.getElementById('form_key');
        var postData = 'form_key=' + encodeURIComponent(formKeyEl ? formKeyEl.value : '');
        postData += '&tipo_pessoa=' + encodeURIComponent(tipoPessoa);
        postData += '&same_billing=' + encodeURIComponent(useAlternate ? '1' : '0');

        var activeShipping = document.querySelector('.shipping-methods .outlined-card.active');
        if (activeShipping) postData += '&shipping_method=' + encodeURIComponent(activeShipping.dataset.shippingCode || '');
        postData += '&payment_method=' + encodeURIComponent(currentPaymentMethod || '');
        postData += '&order_comment=' + encodeURIComponent(savedComment || ''); /* NOVO */

        fields.forEach(function(f) {
            var el = document.getElementById(f);
            if (el) postData += '&' + f + '=' + encodeURIComponent(el.value);
        });

        btn.disabled = true;
        btn.innerHTML = 'Processando...';
        btn.style.opacity = '0.7';

        fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.success) {
                refreshTimeline(true);
                setTimeout(function() {
                    window.location.href = config.ajaxUrl.replace('ultra-checkout/index/placeOrder/', '') + 'ultra-checkout/index/success';
                }, 1500);
            } else {
                alert('Erro: ' + (data.message || 'Tente novamente.'));
                btn.disabled = false;
                btn.innerHTML = 'Finalizar Pedido <i class="ti ti-lock" style="margin-left:6px;"></i>';
                btn.style.opacity = '1';
            }
        })
        .catch(function() {
            alert('Erro de conexão. Tente novamente.');
            btn.disabled = false;
            btn.innerHTML = 'Finalizar Pedido';
            btn.style.opacity = '1';
        });
    }

    /* ALTERADO: agora aceita e-mail opcional para pré-preencher e travar o campo */
    function openLoginModal(prefillEmail) {
        var m = document.getElementById('loginModal');
        if (!m) return;
        m.classList.add('show');

        var loginEmailEl = document.getElementById('login_email');
        var loginSenhaEl = document.getElementById('login_senha');

        if (prefillEmail && loginEmailEl) {
            loginEmailEl.value = prefillEmail;
            loginEmailEl.classList.add('has');
            loginEmailEl.setAttribute('readonly', 'readonly');
            if (loginSenhaEl) setTimeout(function() { loginSenhaEl.focus(); }, 150);
        } else if (loginEmailEl) {
            loginEmailEl.removeAttribute('readonly');
        }
    }
    function closeLoginModal() {
        var m = document.getElementById('loginModal');
        if (m) m.classList.remove('show');

        /* NOVO: ao fechar, libera o campo de e-mail do modal para uso manual futuro */
        var loginEmailEl = document.getElementById('login_email');
        if (loginEmailEl) loginEmailEl.removeAttribute('readonly');
    }
    function closeModalOutside(e) {
    if (e.target.id === 'loginModal') closeLoginModal();
    if (e.target.id === 'secureModal') closeSecureModal();
}

function openSecureModal() {
    var m = document.getElementById('secureModal');
    if (m) m.classList.add('show');
}

function closeSecureModal() {
    var m = document.getElementById('secureModal');
    if (m) m.classList.remove('show');
}

/* NOVO: dispara o clique real do widget oficial da TrustedSite, que abre
   o modal genuíno deles. O elemento existe mas fica invisível via CSS. */
function openTrustedSiteModal() {
    var badge = document.getElementById('trustedsite-tm-image');
    if (badge) {
        badge.click();
    } else {
        // Script ainda não carregou (async) — tenta novamente em breve
        setTimeout(function () {
            var retry = document.getElementById('trustedsite-tm-image');
            if (retry) retry.click();
        }, 500);
    }
}

    /* NOVO: atualiza o texto/comportamento do link "Já é cliente? Entrar" / "Sair" */
    function updateAuthLink() {
        var link = document.getElementById('auth-link');
        if (!link) return;
        link.textContent = isLoggedIn ? 'Sair' : 'Já é cliente? Entrar';
    }

    /* NOVO: roteia o clique do link — abre modal se deslogado, faz logout se logado */
    function handleAuthLinkClick() {
        if (isLoggedIn) {
            doLogout();
        } else {
            openLoginModal();
        }
    }

    /* NOVO: encerra a sessão e recarrega a página (reseta o formulário por completo) */
    function doLogout() {
        var link = document.getElementById('auth-link');
        if (link) link.textContent = 'Saindo...';

        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';
        fetch(config.logoutUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'form_key=' + encodeURIComponent(formKey)
        })
        .then(function() { window.location.reload(); })
        .catch(function() { window.location.reload(); });
    }

    function doLogin() {
        var email   = document.getElementById('login_email') ? document.getElementById('login_email').value.trim() : '';
        var senha   = document.getElementById('login_senha') ? document.getElementById('login_senha').value.trim() : '';
        var errorEl = document.getElementById('login_error');

        if (errorEl) errorEl.style.display = 'none';

        if (!email || !senha) {
            if (errorEl) { errorEl.textContent = 'Informe e-mail e senha.'; errorEl.style.display = 'block'; }
            return;
        }

        var btn = document.querySelector('#loginModal .btn-continue');
        if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

        var formKey = document.getElementById('form_key') ? document.getElementById('form_key').value : '';

        fetch(config.loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'email=' + encodeURIComponent(email) +
                  '&senha=' + encodeURIComponent(senha) +
                  '&form_key=' + encodeURIComponent(formKey)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                closeLoginModal();

                /* NOVO: reseta o botão AGORA, enquanto o modal já está fechado,
                   para que da próxima vez que o modal for aberto (ex: outro
                   fluxo) ele não apareça travado em "Entrando..." */
                if (btn) { btn.disabled = false; btn.textContent = 'Acessar Conta'; }

               /* NOVO: marca estado de logado e atualiza o link superior
                   ("Já é cliente? Entrar" -> "Sair") */
                isLoggedIn = true;
                updateAuthLink();

                /* NOVO: sincroniza o resumo do pedido com o carrinho real após
                   o merge de quote feito pelo back-end no login */
                // TESTE: refreshCartSummary();

                /* Marca a senha como preenchida ANTES de _fillCustomerFields(),
                   pois refreshTimeline() é chamado lá dentro e precisa ver o
                   campo "senha" já resolvido para o dot de Identificação
                   fechar em 100% (antes, a ordem invertida fazia o cálculo
                   de progresso rodar com "senha" ainda vazio). */
                var passwordEl = document.getElementById('senha');
                if (passwordEl) {
                    var passwordWrapper = passwordEl.closest('.fl') || passwordEl.parentElement;
                    if (passwordWrapper) passwordWrapper.style.display = 'none';
                    passwordEl.removeAttribute('required');
                    passwordEl.value = 'LOGGED_IN';
                }

                _fillCustomerFields(data.customer);
            } else {
                if (errorEl) { errorEl.textContent = data.message || 'E-mail ou senha incorretos.'; errorEl.style.display = 'block'; }
                if (btn) { btn.disabled = false; btn.textContent = 'Acessar Conta'; }
            }
        })
        .catch(function() {
            if (errorEl) { errorEl.textContent = 'Erro de conexão. Tente novamente.'; errorEl.style.display = 'block'; }
            if (btn) { btn.disabled = false; btn.textContent = 'Acessar Conta'; }
        });
    }

    function _fillCustomerFields(c) {
        setField('email', c.email);

        var taxvatClean = c.taxvat ? c.taxvat.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
        var isPJ = taxvatClean.length === 14;

        if (isPJ) {
            switchType('pj');
            setField('resp_nome',      c.firstname);
            setField('resp_sobrenome', c.lastname);
            if (c.dob) { setField('nascimento_pj', c.dob); }

            var cnpjEl = document.getElementById('cnpj');
            if (cnpjEl) {
                var raw = taxvatClean;
                cnpjEl.value = raw.slice(0,2) + '.' + raw.slice(2,5) + '.' + raw.slice(5,8) + '/' + raw.slice(8,12) + '-' + raw.slice(12);
                cnpjEl.classList.add('has');
            }

            setTimeout(function() {
                if (c.razao_social)       setField('razao_social',       c.razao_social);
                if (c.cpf_responsavel)    setField('tax_document_pj',    c.cpf_responsavel);
                if (c.inscricao_estadual) setField('inscricao_estadual', c.inscricao_estadual);
            }, 100);

        } else {
            switchType('pf');
        }

        setField('firstname', c.firstname);
        setField('lastname',  c.lastname);
        if (c.dob) { setField('nascimento_pf', c.dob); }
        var cpfEl = document.getElementById('tax_document');
        if (cpfEl) {
            var cpfRaw = taxvatClean.length === 11
                ? taxvatClean
                : (c.cpf_responsavel ? c.cpf_responsavel.replace(/\D/g, '') : '');
            if (cpfRaw.length === 11) {
                cpfEl.value = cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                cpfEl.classList.add('has');
            }
        }

        var telEl = document.getElementById('telephone');
        if (telEl && c.telephone) {
            var telClean = c.telephone.replace(/\D/g, '');
            telEl.value = telClean.length > 10
                ? telClean.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
                : telClean.replace(/^(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
            telEl.classList.add('has');
        }

        var cepEl = document.getElementById('postcode');
        if (cepEl && c.postcode) {
            var cepClean = c.postcode.replace(/\D/g, '');
            cepEl.value = cepClean.replace(/^(\d{5})(\d)/, '$1-$2');
            cepEl.classList.add('has');
        }

        setField('street',     c.street);
        setField('number',     c.number);
        setField('complement', c.complement);
        setField('district',   c.district);
        setField('city',       c.city);

        var regionEl = document.getElementById('region_id');
        if (regionEl && c.region_id) { regionEl.value = c.region_id; regionEl.classList.add('has'); }

        var addrWrapper = document.getElementById('address-fields-wrapper');
        if (addrWrapper) addrWrapper.style.display = 'block';

        refreshTimeline();

        if (c.postcode) {
            fetchShippingRates(c.postcode.replace(/\D/g, ''));
            setTimeout(function() {
                var sections = document.querySelectorAll('.checkout-left .box');
                if (sections[1]) sections[1].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 700);
        }
    }

    function updateRegionSelect(countryId, selectId) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        var regions = (config.regions && config.regions[countryId]) ? config.regions[countryId] : [];
        var currentVal = sel.value;
        sel.innerHTML = '<option value="">Selecione o Estado</option>';
        regions.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r.code;
            opt.textContent = r.name;
            if (r.code === currentVal) opt.selected = true;
            sel.appendChild(opt);
        });
        if (regions.length > 0) {
            sel.style.display = '';
        } else {
            sel.innerHTML = '<option value="">—</option>';
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        calculateTotals(); refreshTimeline();

        var countryEl = document.getElementById('country');
        var billingCountryEl = document.getElementById('billing_country');
        updateRegionSelect(countryEl ? countryEl.value : 'BR', 'region_id');
        updateRegionSelect(billingCountryEl ? billingCountryEl.value : 'BR', 'billing_region_id');

        if (config.customer) {
            _fillCustomerFields(config.customer);
            /* NOVO: se o customer já veio preenchido no config (sessão já ativa
               ao carregar a página), reflete o estado "logado" no link também */
            isLoggedIn = true;
        }
        updateAuthLink();

        if (countryEl) {
            countryEl.addEventListener('change', function() {
                updateRegionSelect(this.value, 'region_id');
            });
        }
        if (billingCountryEl) {
            billingCountryEl.addEventListener('change', function() {
                updateRegionSelect(this.value, 'billing_region_id');
            });
        }

        document.querySelectorAll('input, select').forEach(function(el) {
            el.addEventListener('input', function(){ refreshTimeline(); });
            el.addEventListener('change', function(){ refreshTimeline(); });
        });

        /* NOVO: verifica e-mail existente ao sair do campo (com debounce) */
        var emailEl = document.getElementById('email');
        if (emailEl) {
            emailEl.addEventListener('blur', function() {
                var email = this.value.trim();
                if (emailCheckTimeout) clearTimeout(emailCheckTimeout);
                if (!email || email.indexOf('@') === -1) return;
                emailCheckTimeout = setTimeout(function() {
                    checkEmailExists(email);
                }, 300);
            });
        }

        /* NOVO: valida CPF (PF e PJ) ao sair do campo */
        var cpfPf = document.getElementById('tax_document');
        if (cpfPf) cpfPf.addEventListener('blur', function() { validateCpfField('tax_document'); });

        var cpfPj = document.getElementById('tax_document_pj');
        if (cpfPj) cpfPj.addEventListener('blur', function() { validateCpfField('tax_document_pj'); });

        /* NOVO: valida data de nascimento (PF e PJ) ao sair do campo */
        var dobPf = document.getElementById('nascimento_pf');
        if (dobPf) dobPf.addEventListener('blur', function() { validateBirthDateField('nascimento_pf'); });

        var dobPj = document.getElementById('nascimento_pj');
        if (dobPj) dobPj.addEventListener('blur', function() { validateBirthDateField('nascimento_pj'); });

        /* NOVO: editar o campo com "Remover" ativo volta para "Aplicar"/"Salvar" */
        var couponCodeEl = document.getElementById('coupon_code');
        if (couponCodeEl) {
            couponCodeEl.addEventListener('input', function() {
                var btn = document.getElementById('btn-coupon-action');
                if (btn && btn.textContent.trim() === 'Remover') setActionButtonMode(btn, 'Aplicar');
            });
        }
        var commentEl = document.getElementById('order_comment');
        if (commentEl) {
            commentEl.addEventListener('input', function() {
                var btn = document.getElementById('btn-comment-action');
                if (btn && btn.textContent.trim() === 'Remover') setActionButtonMode(btn, 'Salvar');
            });
        }

        // Com 1 item: ajusta o top do .checkout-right (sticky) para alinhar o fundo com a esquerda
        (function() {
            if (document.querySelectorAll('.summary-item').length !== 1) return;
            var right = document.querySelector('.checkout-right');
            var left = document.querySelector('.checkout-left');
            var payment = document.querySelector('.payment-methods');
            if (!right || !left || !payment) return;

            right.style.transition = 'top 1.2s cubic-bezier(0.4, 0, 0.2, 1)';

            window.addEventListener('scroll', function() {
                var paymentTop = payment.getBoundingClientRect().top;
                var windowHeight = window.innerHeight;
                // Só ativa quando o bloco de pagamento está visível na tela
                if (paymentTop < windowHeight) {
                    var diff = left.offsetHeight - right.offsetHeight;
                    right.style.top = Math.max(110, 110 + diff) + 'px';
                } else {
                    right.style.top = '110px';
                }
            }, { passive: true });
        })();

    });

    return {
        switchType: switchType, handleInputState: handleInputState,
        fmtData: fmtData, fmtCpf: fmtCpf, fmtCnpj: fmtCnpj, fmtTel: fmtTel, fmtCep: fmtCep,
        toggleBilling: toggleBilling, checkCepDisplay: checkCepDisplay, checkBillingCep: checkBillingCep,
        selectShipping: selectShipping, selectPayment: selectPayment,
        updateQty: updateQty, applyCoupon: applyCoupon, removeCoupon: removeCoupon, calculateTotals: calculateTotals,
        finalizeOrder: finalizeOrder, refreshTimeline: refreshTimeline,
        openLoginModal: openLoginModal, closeLoginModal: closeLoginModal,
        doLogin: doLogin, updateRegionSelect: updateRegionSelect,
        closeModalOutside: closeModalOutside,
        isValidCPF: isValidCPF, isValidBirthDate: isValidBirthDate,
        handleAuthLinkClick: handleAuthLinkClick, doLogout: doLogout,
        openSecureModal: openSecureModal, closeSecureModal: closeSecureModal,
        openTrustedSiteModal: openTrustedSiteModal,
        refreshCartSummary: refreshCartSummary,
        toggleCouponRow: toggleCouponRow, toggleCommentRow: toggleCommentRow,
        handleCouponAction: handleCouponAction, handleCommentAction: handleCommentAction
    };
})();
