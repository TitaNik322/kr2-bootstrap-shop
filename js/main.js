/* No server or framework is required. Bootstrap owns component behavior. */
(() => {
  'use strict';
  const products = window.SHOP_PRODUCTS;
  const byId = new Map(products.map(product => [product.id, product]));
  const money = value => new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
  }).format(value);
  const params = new URLSearchParams(location.search);
  const storageKey = 'tochka-favorites-v1';
  let storageAvailable = true;
  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) favorites = new Set(saved.filter(id => byId.has(id)));
  } catch { storageAvailable = false; }

  function notify(message) {
    document.getElementById('toastMessage').textContent = message;
    bootstrap.Toast.getOrCreateInstance(document.getElementById('siteToast'), { delay: 3000 }).show();
  }
  function refreshFavorites() {
    document.querySelectorAll('[data-favorite-count]').forEach(count => {
      count.textContent = favorites.size;
    });
    document.querySelectorAll('[data-favorite]').forEach(button => {
      const selected = favorites.has(button.dataset.favorite);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${selected ? 'Убрать из избранного' : 'В избранное'}: ${byId.get(button.dataset.favorite)?.name || ''}`);
    });
    const grid = document.getElementById('favoritesGrid');
    if (grid) {
      grid.querySelectorAll('[data-product-card]').forEach(card => {
        card.hidden = !favorites.has(card.dataset.id);
      });
      document.getElementById('favoritesEmpty').hidden = favorites.size > 0;
      document.getElementById('storageWarning').hidden = storageAvailable;
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-favorite]');
    if (!button || !byId.has(button.dataset.favorite)) return;
    const id = button.dataset.favorite;
    const had = favorites.has(id);
    if (had) favorites.delete(id); else favorites.add(id);
    try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); }
    catch { storageAvailable = false; }
    refreshFavorites();
    notify(`${byId.get(id).name} ${had ? 'убран из избранного' : 'добавлен в избранное'}.${storageAvailable ? '' : ' Сохранение в браузере недоступно.'}`);
    if (document.getElementById('favoritesGrid') && had) {
      (document.querySelector('#favoritesGrid [data-product-card]:not([hidden]) [data-favorite]') || document.querySelector('#favoritesEmpty a')).focus();
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const saved = JSON.parse(event.newValue || '[]');
      favorites = new Set(Array.isArray(saved) ? saved.filter(id => byId.has(id)) : []);
    } catch { favorites = new Set(); }
    refreshFavorites();
  });
  refreshFavorites();

  // Catalog filters work on the static cards; all products are readable without JS.
  const filters = document.getElementById('catalogFilters');
  if (filters) {
    const grid = document.getElementById('catalogGrid');
    const cards = new Map([...grid.children].map(card => [card.dataset.id, card]));
    const sort = document.getElementById('sort');
    const category = filters.elements.category;
    const requestedCategory = params.get('category');
    if ([...category.options].some(option => option.value === requestedCategory)) category.value = requestedCategory;
    let currentPage = 1;
    const pageSize = 6;
    function renderCatalog() {
      const search = filters.elements.search.value.trim().toLocaleLowerCase('ru');
      const rawPrice = filters.elements.maxPrice.value;
      const maxPrice = rawPrice === '' ? Infinity : Math.max(0, Number(rawPrice));
      const matching = products.filter(product =>
        (!category.value || product.category === category.value) &&
        (!search || `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('ru').includes(search)) &&
        product.price <= maxPrice && (!filters.elements.sale.checked || product.old > product.price));
      if (sort.value === 'price-asc') matching.sort((a, b) => a.price - b.price);
      if (sort.value === 'price-desc') matching.sort((a, b) => b.price - a.price);
      if (sort.value === 'name') matching.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const pageCount = Math.ceil(matching.length / pageSize);
      currentPage = Math.min(currentPage, Math.max(1, pageCount));
      cards.forEach(card => { card.hidden = true; });
      matching.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(product => {
        const card = cards.get(product.id);
        card.hidden = false;
        grid.append(card);
      });
      document.getElementById('catalogCount').textContent = `Найдено товаров: ${matching.length}${pageCount > 1 ? ` · Страница ${currentPage} из ${pageCount}` : ''}`;
      document.getElementById('catalogEmpty').hidden = matching.length > 0;
      const pagination = document.getElementById('pagination');
      pagination.replaceChildren();
      for (let page = 1; page <= pageCount && pageCount > 1; page++) {
        const item = document.createElement('li');
        item.className = `page-item${page === currentPage ? ' active' : ''}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'page-link';
        button.textContent = page;
        button.setAttribute('aria-label', `Страница ${page}`);
        if (page === currentPage) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          currentPage = page;
          renderCatalog();
          pagination.querySelector('[aria-current="page"]').focus({ preventScroll: true });
          document.getElementById('catalogCount').scrollIntoView({ block: 'center' });
        });
        item.append(button);
        pagination.append(item);
      }
    }
    filters.addEventListener('submit', event => event.preventDefault());
    filters.addEventListener('input', () => { currentPage = 1; renderCatalog(); });
    sort.addEventListener('change', () => { currentPage = 1; renderCatalog(); });
    filters.addEventListener('reset', () => {
      // The reset event fires before the browser restores default field values.
      setTimeout(() => { sort.value = 'popular'; currentPage = 1; renderCatalog(); }, 0);
    });
    document.querySelector('[data-reset-filters]').addEventListener('click', () => {
      filters.reset();
      filters.elements.search.focus();
    });
    renderCatalog();
  }

  const detail = document.getElementById('productContent');
  if (detail) {
    const product = byId.get(params.has('id') ? params.get('id') : 'keys-air');
    if (!product) {
      detail.hidden = true;
      document.getElementById('productNotFound').hidden = false;
      document.title = 'Товар не найден — Точка';
    } else {
      document.title = `${product.name} — Точка`;
      const values = { detailName: product.name, detailCategory: product.category,
        detailBadge: product.tag, detailDescription: product.description,
        detailPrice: money(product.price), detailOldPrice: product.old ? money(product.old) : '' };
      Object.entries(values).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
      document.getElementById('detailOldPrice').hidden = !product.old;
      const image = document.getElementById('detailImage');
      image.src = `images/${product.id}.svg`;
      image.alt = `${product.name} — ${product.category.toLocaleLowerCase('ru')}`;
      ['detailOrder', 'helpOrder'].forEach(id => { document.getElementById(id).href = `order.html?product=${product.id}`; });
      document.getElementById('detailFavorite').dataset.favorite = product.id;
      const specs = document.getElementById('detailSpecs');
      specs.replaceChildren();
      Object.entries(product.specs).forEach(([name, value]) => {
        const row = document.createElement('tr');
        const header = document.createElement('th'); header.scope = 'row'; header.textContent = name;
        const cell = document.createElement('td'); cell.textContent = value;
        row.append(header, cell); specs.append(row);
      });
      refreshFavorites();
    }
  }

  const form = document.getElementById('orderForm');
  if (!form) return;
  // Without JS, keep the demo form disabled so native GET submission cannot occur.
  document.getElementById('orderFields').disabled = false;
  const productSelect = form.elements.product;
  const quantityInput = form.elements.quantity;
  const address = form.elements.address;
  const confirmationElement = document.getElementById('confirmModal');
  const confirmation = bootstrap.Modal.getOrCreateInstance(confirmationElement);
  const confirmButton = document.getElementById('confirmOrder');
  let pendingOrder = null;
  let completed = false;
  const requestedProduct = params.get('product');
  if (byId.has(requestedProduct)) productSelect.value = requestedProduct;
  else if (params.has('product')) {
    const warning = document.createElement('div');
    warning.className = 'alert alert-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = 'Товар из ссылки не найден. Выберите доступный товар из списка.';
    form.prepend(warning);
  }
  function orderValues() {
    const product = byId.get(productSelect.value);
    const quantity = Number(quantityInput.value);
    const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10;
    const subtotal = product && validQuantity ? product.price * quantity : 0;
    const courier = form.elements.delivery.value === 'courier';
    const delivery = product && validQuantity && courier && subtotal < 10000 ? 390 : 0;
    return { product, quantity, subtotal, delivery, total: subtotal + delivery, courier };
  }
  function updateSummary() {
    const order = orderValues();
    const summaryImage = document.getElementById('summaryImage');
    summaryImage.hidden = !order.product;
    if (order.product) summaryImage.src = `images/${order.product.id}.svg`;
    document.getElementById('summaryName').textContent = order.product ? `${order.product.name} × ${order.quantity || '—'}` : 'Товар пока не выбран';
    document.getElementById('summarySubtotal').textContent = money(order.subtotal);
    document.getElementById('summaryDelivery').textContent = money(order.delivery);
    document.getElementById('summaryTotal').textContent = money(order.total);
    address.disabled = !order.courier;
    address.required = order.courier;
    document.getElementById('addressField').hidden = !order.courier;
    if (!order.courier) markField(address, true);
    document.getElementById('commentCount').textContent = `${form.elements.comment.value.length} / 500`;
  }
  function markField(field, valid) {
    field.classList.toggle('is-invalid', !valid);
    field.setAttribute('aria-invalid', String(!valid));
    if (document.getElementById(`${field.id}Error`)) {
      const hints = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      if (!valid) hints.add(`${field.id}Error`); else hints.delete(`${field.id}Error`);
      if (hints.size) field.setAttribute('aria-describedby', [...hints].join(' '));
      else field.removeAttribute('aria-describedby');
    }
  }
  function validField(field) {
    if (field.disabled) return true;
    const value = field.value.trim();
    if (field.name === 'name') return value.length >= 2 && value.length <= 80;
    if (field.name === 'phone') {
      const digits = value.replace(/\D/g, '');
      return /^[+\d\s()-]+$/.test(value) && /^[78]\d{10}$/.test(digits);
    }
    if (field.name === 'product') return byId.has(value);
    if (field.name === 'quantity') return field.checkValidity() && Number.isInteger(Number(value));
    if (field.name === 'address') return !field.required || (value.length >= 8 && value.length <= 250);
    return field.checkValidity();
  }
  form.addEventListener('input', event => {
    updateSummary();
    if (event.target.classList.contains('is-invalid')) markField(event.target, validField(event.target));
  });
  form.addEventListener('change', updateSummary);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = [...form.elements].filter(field => ['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName));
    let firstInvalid;
    fields.forEach(field => {
      const valid = validField(field);
      markField(field, valid);
      if (!valid && !firstInvalid) firstInvalid = field;
    });
    document.getElementById('formErrors').hidden = !firstInvalid;
    if (firstInvalid) { firstInvalid.focus(); return; }
    const order = orderValues();
    pendingOrder = { ...order, name: form.elements.name.value.trim(), email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(), address: address.disabled ? '' : address.value.trim(),
      comment: form.elements.comment.value.trim() };
    const details = document.getElementById('confirmationDetails');
    details.replaceChildren();
    const rows = { 'Товар': `${order.product.name} × ${order.quantity}`, 'Имя': pendingOrder.name,
      'Почта': pendingOrder.email, 'Телефон': pendingOrder.phone,
      'Получение': order.courier ? 'Курьер' : 'Самовывоз' };
    if (order.courier) rows['Адрес'] = pendingOrder.address;
    if (pendingOrder.comment) rows['Комментарий'] = pendingOrder.comment;
    rows['Доставка'] = money(order.delivery);
    rows['Итого'] = money(order.total);
    Object.entries(rows).forEach(([label, value]) => {
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = value;
      details.append(term, description);
    });
    confirmButton.disabled = false;
    confirmation.show();
  });
  confirmButton.addEventListener('click', () => {
    if (!pendingOrder || completed) return;
    confirmButton.disabled = true;
    document.getElementById('successText').textContent = `${pendingOrder.product.name} × ${pendingOrder.quantity}. Итого: ${money(pendingOrder.total)}. Данные проверены в браузере; в магазин ничего не отправлено.`;
    completed = true;
    pendingOrder = null;
    document.getElementById('confirmationDetails').replaceChildren();
    confirmation.hide();
  });
  confirmationElement.addEventListener('hidden.bs.modal', () => {
    pendingOrder = null;
    if (completed) {
      document.getElementById('orderLayout').hidden = true;
      const success = document.getElementById('orderSuccess');
      success.hidden = false;
      form.reset();
      success.focus();
    }
  });
  document.getElementById('newOrder').addEventListener('click', () => {
    completed = false;
    document.getElementById('orderSuccess').hidden = true;
    document.getElementById('orderLayout').hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(field => markField(field, true));
    document.getElementById('formErrors').hidden = true;
    updateSummary();
    productSelect.focus();
  });
  updateSummary();
})();
