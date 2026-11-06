// Petites aides pour le questionnaire : barre de progression, visages, double envoi.
(function () {
  var form = document.querySelector('.questionnaire');
  if (!form) return;
  var questions = Array.prototype.slice.call(form.querySelectorAll('.question'));
  var barre = document.querySelector('.progression-barre');

  function estRepondue(q) {
    var champs = q.querySelectorAll('input, textarea');
    for (var i = 0; i < champs.length; i++) {
      var c = champs[i];
      if ((c.type === 'radio' || c.type === 'checkbox') ? c.checked : c.value.trim() !== '') return true;
    }
    return false;
  }

  function majVisages(q) {
    var legende = q.querySelector('.visages-choix');
    if (!legende) return;
    var coche = q.querySelector('.visage input:checked');
    legende.textContent = coche ? coche.value + ' · ' + coche.closest('.visage').getAttribute('data-libelle') : '';
    legende.parentNode.classList.toggle('a-choisi', Boolean(coche));
  }

  function maj() {
    var faites = 0;
    questions.forEach(function (q) {
      var ok = estRepondue(q);
      q.classList.toggle('repondue', ok);
      if (ok) { faites++; q.classList.remove('question-erreur'); }
      majVisages(q);
    });
    if (barre && questions.length) barre.style.width = (faites / questions.length * 100) + '%';
  }

  form.addEventListener('change', maj);
  form.addEventListener('input', maj);
  maj();

  // Quand une réponse obligatoire manque, on montre la question concernée.
  var premiereErreur = null;
  form.addEventListener('invalid', function (e) {
    var q = e.target.closest('.question');
    if (q) q.classList.add('question-erreur');
    if (!premiereErreur && q) {
      premiereErreur = q;
      q.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { premiereErreur = null; }, 400);
    }
  }, true);

  form.addEventListener('submit', function () {
    var bouton = form.querySelector('button[type="submit"]');
    if (bouton) {
      setTimeout(function () { bouton.disabled = true; bouton.textContent = 'Envoi en cours…'; }, 0);
    }
  });

  var erreur = document.querySelector('.question-erreur');
  if (erreur) erreur.scrollIntoView({ block: 'center' });
})();
