// Espace administrateur : confirmations, impression, copie du lien, aperçu des feuilles.
(function () {
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirmer');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var cible = e.target.closest('[data-imprimer], [data-copier], [data-voir-mdp]');
    if (!cible) return;

    if (cible.hasAttribute('data-imprimer')) window.print();

    if (cible.hasAttribute('data-copier')) {
      var champ = document.querySelector('[data-lien]');
      var texte = champ.value;
      var fait = function () {
        var avant = cible.innerHTML;
        cible.textContent = 'Lien copié !';
        setTimeout(function () { cible.innerHTML = avant; }, 1800);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(texte).then(fait, function () { champ.select(); });
      else { champ.select(); document.execCommand('copy'); fait(); }
    }

    if (cible.hasAttribute('data-voir-mdp')) {
      var input = cible.parentNode.querySelector('input');
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      cible.setAttribute('aria-pressed', String(!visible));
      cible.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.hasAttribute('data-soumettre')) e.target.form.submit();
  });

  // Aperçu des feuilles A4 : on réduit la feuille pour qu'elle tienne dans l'écran.
  var feuilles = document.querySelector('.feuilles');
  if (feuilles) {
    var largeurA4 = 210 * 96 / 25.4;
    var ajuster = function () {
      var dispo = document.documentElement.clientWidth - 32;
      var echelle = Math.min(1, dispo / largeurA4);
      document.documentElement.style.setProperty('--echelle', echelle.toFixed(3));
    };
    ajuster();
    window.addEventListener('resize', ajuster);
  }
})();
