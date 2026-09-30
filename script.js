// 1. Bascule clair / sombre (mémorisée dans le navigateur)
const root = document.documentElement;
const themeBtn = document.getElementById('theme');

function currentTheme() {
  return root.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* stockage indisponible */ }
});

// 2. Effet de frappe sur la demande (désactivé si mouvement réduit)
const typed = document.getElementById('typed');
if (typed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const text = typed.textContent;
  typed.textContent = '';
  let i = 0;
  const timer = setInterval(() => {
    typed.textContent = text.slice(0, ++i);
    if (i >= text.length) clearInterval(timer);
  }, 35);
}

// 3. Année du pied de page
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
