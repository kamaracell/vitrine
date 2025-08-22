const bcrypt = require('bcryptjs');

const password = "#*OSMv2k6h0151913AR"; // Substitua por uma senha forte
const saltRounds = 19; // Quanto maior o número, mais segura a senha (e mais lento o processo)

bcrypt.hash(password, saltRounds, function(err, hash) {
    if (err) {
        console.error('Erro ao gerar o hash:', err);
    } else {
        console.log('Senha original:', password);
        console.log('Senha criptografada (hash):', hash);
    }
});

