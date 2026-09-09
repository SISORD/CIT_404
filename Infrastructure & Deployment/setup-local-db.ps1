<#
  CIT: 404 — base PostgreSQL locale, sans Docker et sans droits administrateur.

  Utilise les binaires portables PostgreSQL (le zip "binaries" d'EDB, pas
  l'installeur) : rien n'est ecrit dans Program Files, aucun service Windows
  n'est enregistre, tout vit dans -Root.

    .\setup-local-db.ps1                 # installe et demarre
    .\setup-local-db.ps1 -Action start   # redemarre apres un reboot
    .\setup-local-db.ps1 -Action stop
    .\setup-local-db.ps1 -Action status
    .\setup-local-db.ps1 -Action reset   # detruit le cluster et recommence

  Le mot de passe est ecrit dans Backend\.env ; le cluster n'ecoute que sur
  localhost.
#>
[CmdletBinding()]
param(
    [ValidateSet('install', 'start', 'stop', 'status', 'reset')]
    [string]$Action = 'install',

    [string]$Root = "$env:USERPROFILE\pgsql-portable",
    [int]$Port = 5432,
    [string]$Database = 'cit404',
    [string]$SuperUser = 'postgres',
    [string]$Password = 'cit404local',
    [string]$ZipUrl = 'https://get.enterprisedb.com/postgresql/postgresql-17.2-1-windows-x64-binaries.zip'
)

$ErrorActionPreference = 'Stop'

$Bin      = Join-Path $Root 'pgsql\bin'
$Data     = Join-Path $Root 'data'
$LogFile  = Join-Path $Root 'postgres.log'
$Zip      = Join-Path $Root 'pg17.zip'
$Project  = Split-Path -Parent $PSScriptRoot
$InitSql  = Join-Path $PSScriptRoot 'init.sql'
$SeedSql  = Join-Path $PSScriptRoot 'seed.sql'

function Say([string]$m, [string]$c = 'Green') { Write-Host "  $m" -ForegroundColor $c }

function Assert-Binaries {
    if (-not (Test-Path (Join-Path $Bin 'postgres.exe'))) {
        throw "Binaires absents de $Bin. Relance sans -Action pour les installer."
    }
}

function Get-Binaries {
    New-Item -ItemType Directory -Force -Path $Root | Out-Null

    if (Test-Path (Join-Path $Bin 'postgres.exe')) {
        Say 'Binaires deja presents, telechargement ignore.'
        return
    }

    if (-not (Test-Path $Zip)) {
        Say "Telechargement de PostgreSQL (~370 Mo)..." 'Cyan'
        # Invoke-WebRequest sans barre de progression est nettement plus rapide.
        $prev = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try { Invoke-WebRequest -Uri $ZipUrl -OutFile $Zip -UseBasicParsing }
        finally { $ProgressPreference = $prev }
    }

    Say 'Extraction...' 'Cyan'
    Expand-Archive -Path $Zip -DestinationPath $Root -Force
    Assert-Binaries
    Say 'Binaires installes.'
}

function New-Cluster {
    if (Test-Path (Join-Path $Data 'PG_VERSION')) {
        Say 'Cluster deja initialise.'
        return
    }

    Say 'Creation du cluster...' 'Cyan'
    $pwFile = Join-Path $Root '.initpw'
    try {
        # Le mot de passe passe par un fichier : il n'apparait pas dans la
        # ligne de commande, donc pas dans la liste des processus.
        Set-Content -Path $pwFile -Value $Password -NoNewline -Encoding ascii
        & (Join-Path $Bin 'initdb.exe') -D $Data -U $SuperUser -A scram-sha-256 `
            --pwfile=$pwFile -E UTF8 --locale=C | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "initdb a echoue (code $LASTEXITCODE)." }
    }
    finally {
        if (Test-Path $pwFile) { Remove-Item $pwFile -Force }
    }

    # N'ecouter que la boucle locale : le cluster ne doit pas etre joignable
    # depuis le reseau de la salle.
    Add-Content -Path (Join-Path $Data 'postgresql.conf') `
        -Value "`nlisten_addresses = 'localhost'`nport = $Port"

    Say 'Cluster cree.'
}

function Start-Cluster {
    Assert-Binaries
    if (Test-Cluster) { Say 'Serveur deja demarre.'; return }

    # Surtout ne pas rediriger la sortie de pg_ctl vers un pipe PowerShell :
    # le serveur herite du handle et le pipe ne se ferme jamais, donc le
    # script reste bloque alors que la base tourne. Start-Process detache
    # proprement, puis on interroge nous-memes pg_isready.
    Start-Process -FilePath (Join-Path $Bin 'pg_ctl.exe') `
        -ArgumentList @('-D', "`"$Data`"", '-l', "`"$LogFile`"", 'start') `
        -NoNewWindow | Out-Null

    for ($i = 0; $i -lt 30; $i++) {
        if (Test-Cluster) { Say "Serveur demarre sur le port $Port."; return }
        Start-Sleep -Seconds 1
    }

    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
    throw 'Le serveur n a pas demarre. Voir le log ci-dessus.'
}

function Stop-Cluster {
    Assert-Binaries
    if (-not (Test-Cluster)) { Say 'Serveur deja arrete.'; return }
    Start-Process -FilePath (Join-Path $Bin 'pg_ctl.exe') `
        -ArgumentList @('-D', "`"$Data`"", '-m', 'fast', 'stop') `
        -NoNewWindow -Wait | Out-Null
    Say 'Serveur arrete.'
}

function Test-Cluster {
    if (-not (Test-Path (Join-Path $Bin 'pg_isready.exe'))) { return $false }
    & (Join-Path $Bin 'pg_isready.exe') -h localhost -p $Port -q 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-Psql([string]$db, [string]$file, [string]$command) {
    $env:PGPASSWORD = $Password
    try {
        $args = @('-h', 'localhost', '-p', $Port, '-U', $SuperUser, '-d', $db, '-v', 'ON_ERROR_STOP=1', '-q')
        if ($file)    { $args += @('-f', $file) }
        if ($command) { $args += @('-c', $command) }
        & (Join-Path $Bin 'psql.exe') @args
        if ($LASTEXITCODE -ne 0) { throw "psql a echoue (code $LASTEXITCODE)." }
    }
    finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}

function Initialize-Schema {
    $env:PGPASSWORD = $Password
    $exists = & (Join-Path $Bin 'psql.exe') -h localhost -p $Port -U $SuperUser -d postgres `
        -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    if ($exists -ne '1') {
        Invoke-Psql -db 'postgres' -command "CREATE DATABASE $Database"
        Say "Base '$Database' creee."
    } else {
        Say "Base '$Database' deja presente."
    }

    Say 'Application du schema (init.sql)...' 'Cyan'
    Invoke-Psql -db $Database -file $InitSql
    Say 'Chargement du contenu de jeu (seed.sql)...' 'Cyan'
    Invoke-Psql -db $Database -file $SeedSql
    Say 'Schema en place.'
}

function Update-EnvFile {
    $envPath = Join-Path $Project 'Backend\.env'
    $url = "postgresql://${SuperUser}:${Password}@localhost:${Port}/${Database}"

    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $Project 'Backend\.env.example') $envPath
    }

    $lines = Get-Content $envPath
    if ($lines -match '^DATABASE_URL=') {
        $lines = $lines -replace '^DATABASE_URL=.*', "DATABASE_URL=$url"
    } else {
        $lines += "DATABASE_URL=$url"
    }
    Set-Content -Path $envPath -Value $lines -Encoding utf8
    Say 'Backend\.env mis a jour avec DATABASE_URL.'
}

# ---------------------------------------------------------------------

Write-Host ''
Write-Host '  CIT: 404 — BASE LOCALE' -ForegroundColor Yellow
Write-Host '  ----------------------' -ForegroundColor Yellow

switch ($Action) {
    'start'  { Start-Cluster }
    'stop'   { Stop-Cluster }
    'status' {
        if (Test-Cluster) { Say "Serveur en ecoute sur localhost:$Port." }
        else { Say 'Serveur arrete.' 'Yellow' }
    }
    'reset'  {
        Stop-Cluster
        if (Test-Path $Data) { Remove-Item $Data -Recurse -Force; Say 'Cluster supprime.' 'Yellow' }
        New-Cluster; Start-Cluster; Initialize-Schema; Update-EnvFile
    }
    'install' {
        Get-Binaries
        New-Cluster
        Start-Cluster
        Initialize-Schema
        Update-EnvFile

        Write-Host ''
        Say 'Pret. Etape suivante :' 'Yellow'
        Write-Host '    cd Backend && npm run seed' -ForegroundColor White
        Write-Host '  (affiche une seule fois le mot de passe admin et les codes d equipe)' -ForegroundColor DarkGray
    }
}

Write-Host ''
