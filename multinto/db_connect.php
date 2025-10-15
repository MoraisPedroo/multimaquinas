<?php
// Configuração da conexão
$dsn = "pgsql:host=ep-empty-truth-acj2qr35-pooler.sa-east-1.aws.neon.tech;port=5432;dbname=neondb;sslmode=require";
$user = "neondb_owner";
$password = "npg_5VZQatp9bAYE";

try {
    $conn = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    echo "✅ Conexão com o banco Neon bem-sucedida!";

    // Teste com uma consulta simples para verificar a conexão
    $stmt = $conn->query("SELECT 1 AS test");
    $result = $stmt->fetch();
    echo "<br>✅ Resultado do teste: " . $result['test'];
} catch (PDOException $e) {
    die("❌ Erro ao conectar: " . $e->getMessage());
}
?>