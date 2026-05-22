var UltraCheckout = (function () {
    'use strict';
    var CIRCUM = 119.4;
    var tipoPessoa = 'pf';
    var currentPaymentMethod = null;
    var currentShippingPrice = null;
    var currentShippingName = '';
    var appliedDiscountAmount = 0;
    var pulseTimeout;
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
        var tax = tipoPessoa === 'pf' ? digits('tax_document') : digits('cnpj');
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
    function fmt(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

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
    function fmtCnpj(e) { var v = e.value.replace(/\D/g,''); e.value = v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'); }
    function fmtTel(e) { var v = e.value.replace(/\D/g,''); e.value = v.length > 10 ? v.replace(/^(\d{2})(\d{5})(\d)/,'($1) $2-$3') : v.replace(/^(\d{2})(\d{4})(\d)/,'($1) $2-$3'); }
    function fmtCep(e) { var v = e.value.replace(/\D/g,''); e.value = v.replace(/^(\d{5})(\d)/,'$1-$2'); }

    function checkCepDisplay(element) {
        var raw = element.value.replace(/\D/g,'');
        var wrapper = document.getElementById('address-fields-wrapper');
        if (raw.length === 8) { wrapper.style.display = 'block'; fetchCepData(raw); fetchShippingRates(raw); }
        else { wrapper.style.display = 'none'; }
    }
    function fetchCepData(cep) {
        fetch('https://viacep.com.br/ws/' + cep + '/json/')
            .then(function(r){ return r.json(); })
            .then(function(data) {
                if (!data.erro) {
                    setField('street', data.logradouro); setField('district', data.bairro); setField('city', data.localidade);
                    if (data.uf) { var sel = document.getElementById('region_id'); if (sel) { sel.value = data.uf; sel.classList.add('has'); } }
                    var numEl = document.getElementById('number'); if (numEl) numEl.focus();
                    refreshTimeline();
                }
            }).catch(function(){});
    }
    function setField(id, value) { var el = document.getElementById(id); if (el && value) { el.value = value; el.classList.add('has'); } }

    function fetchShippingRates(cep) {
        var container = document.getElementById('shipping-methods-container');
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
                card.setAttribute('onclick', 'UltraCheckout.selectShipping(this,' + rate.price + ',"' + rate.title + '")');
                card.innerHTML = '<div class="outlined-head"><div><div class="outlined-label">' + rate.title + '</div></div><div style="display:flex;align-items:center;gap:12px;"><span class="outlined-price">' + price + '</span><div class="radio"><div class="radio-dot"></div></div></div></div>';
                container.appendChild(card);
            });
            calculateTotals();
        }).catch(function() { container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Erro ao calcular frete.</p>'; });
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

    function updateQty(btn, change) {
        var inp = btn.closest('.usc-qty-wrap').querySelector('.usc-qty');
        inp.value = Math.max(1, parseInt(inp.value) + change);
        calculateTotals();
    }
    function applyCoupon() {
        var code = document.getElementById('coupon_code').value.trim().toUpperCase();
        if (code === 'ULTRA10') { appliedDiscountAmount = 10.00; alert('Cupom de R$ 10,00 aplicado com sucesso!'); }
        else if (code !== '') { alert('Cupom inválido ou expirado.'); appliedDiscountAmount = 0; }
        calculateTotals();
    }

    function calculateTotals() {
        var sub = 0;
        document.querySelectorAll('.usc-qty').forEach(function(inp) {
            var qty = parseInt(inp.value) || 1, unit = parseFloat(inp.dataset.price), tot = qty * unit;
            sub += tot;
            var target = document.getElementById(inp.dataset.target);
            if (target) target.textContent = fmt(tot);
        });
        var freight = currentShippingPrice !== null ? currentShippingPrice : 0;
        var total = Math.max(0, sub + freight - appliedDiscountAmount);
        document.getElementById('subtotal-val').textContent = fmt(sub);
        document.getElementById('shipping-val').textContent = currentShippingPrice !== null ? fmt(freight) : '—';
        document.getElementById('shipping-label-name').textContent = currentShippingName ? 'Frete (' + currentShippingName + ')' : 'Frete';
        document.getElementById('discount-val').textContent = '−' + fmt(appliedDiscountAmount);
        document.getElementById('total-val').textContent = fmt(total);
    }

    function finalizeOrder() {
        var btn = document.getElementById('btn-finalize');
        if (btn.disabled) return;
        var fields = ['email','senha','firstname','lastname','tax_document','resp_nome','resp_sobrenome','tax_document_pj','cnpj','inscricao_estadual','razao_social','telephone','postcode','street','number','complement','district','city','region_id','country','coupon_code'];
        var postData = 'form_key=' + encodeURIComponent(document.getElementById('form_key') ? document.getElementById('form_key').value : '');
        postData += '&tipo_pessoa=' + encodeURIComponent(tipoPessoa);
        var activeShipping = document.querySelector('.shipping-methods .outlined-card.active');
        if (activeShipping) postData += '&shipping_method=' + encodeURIComponent(activeShipping.dataset.shippingCode || '');
        postData += '&payment_method=' + encodeURIComponent(currentPaymentMethod || '');
        fields.forEach(function(f) { var el = document.getElementById(f); if (el) postData += '&' + f + '=' + encodeURIComponent(el.value); });
        btn.disabled = true; btn.innerHTML = 'Processando...'; btn.style.opacity = '0.7';
        fetch(config.ajaxUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData
        })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.success) {
                refreshTimeline(true);
                setTimeout(function() { window.location.href = (config.baseUrl || '/') + 'checkout/onepage/success'; }, 1500);
            } else {
                alert('Erro: ' + (data.message || 'Tente novamente.'));
                btn.disabled = false; btn.innerHTML = 'Finalizar Pedido <i class="ti ti-lock" style="margin-left:6px;"></i>'; btn.style.opacity = '1';
            }
        })
        .catch(function() { alert('Erro de conexão. Tente novamente.'); btn.disabled = false; btn.innerHTML = 'Finalizar Pedido'; btn.style.opacity = '1'; });
    }

    function openLoginModal() { document.getElementById('loginModal').classList.add('show'); }
    function closeLoginModal() { document.getElementById('loginModal').classList.remove('show'); }
    function closeModalOutside(e) { if (e.target.id === 'loginModal') closeLoginModal(); }
    function doLogin() { alert('Integração com login será feita via endpoint Magento customer/account/loginPost.'); }

    document.addEventListener('DOMContentLoaded', function() {
        calculateTotals(); refreshTimeline();
        document.querySelectorAll('input, select').forEach(function(el) {
            el.addEventListener('input', function(){ refreshTimeline(); });
            el.addEventListener('change', function(){ refreshTimeline(); });
        });
    });

    return {
        switchType: switchType, handleInputState: handleInputState, fmtData: fmtData, fmtCpf: fmtCpf, fmtCnpj: fmtCnpj, fmtTel: fmtTel, fmtCep: fmtCep,
        checkCepDisplay: checkCepDisplay, selectShipping: selectShipping, selectPayment: selectPayment, updateQty: updateQty, applyCoupon: applyCoupon,
        calculateTotals: calculateTotals, finalizeOrder: finalizeOrder, refreshTimeline: refreshTimeline,
        openLoginModal: openLoginModal, closeLoginModal: closeLoginModal, closeModalOutside: closeModalOutside, doLogin: doLogin
    };
})();
