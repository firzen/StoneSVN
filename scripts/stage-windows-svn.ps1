param([Parameter(Mandatory = $true)][string]$Destination)

$ErrorActionPreference = 'Stop'
$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) {
    throw "Output already exists: $Destination"
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("stonesvn-svn-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $msi = Join-Path $work 'Slik-Subversion-1.14.5-x64.msi'
    Invoke-WebRequest 'https://sliksvn.com/pub/Slik-Subversion-1.14.5-x64.msi' -OutFile $msi
    $expected = '21aa09ec9db9868cd56a378c44d276643171bcf5fcd8aa4877dee60c2b756200'
    if ((Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash -ne $expected) {
        throw 'Unexpected SVN installer checksum'
    }

    $extract = Join-Path $work 'extract'
    $installer = Start-Process msiexec.exe -ArgumentList "/a `"$msi`" /qn TARGETDIR=`"$extract`"" -Wait -PassThru
    if ($installer.ExitCode -ne 0) {
        throw "SVN extraction failed with exit code $($installer.ExitCode)"
    }
    $client = @(Get-ChildItem -LiteralPath $extract -Recurse -File -Filter svn.exe)
    if ($client.Count -ne 1) {
        throw "Expected one svn.exe in the MSI, found $($client.Count)"
    }
    $notices = @(Get-ChildItem -LiteralPath $extract -Recurse -File |
        Where-Object { $_.Name -match 'license|copying|notice' })
    if (-not ($notices.Name -contains 'Subversion-License.txt')) {
        throw 'Missing Subversion license in the MSI'
    }

    $licenses = Join-Path $Destination 'licenses'
    New-Item -ItemType Directory -Path $licenses -Force | Out-Null
    $notices | Copy-Item -Destination $licenses
    Get-ChildItem -LiteralPath $client[0].DirectoryName -Filter '*.dll' -File |
        Copy-Item -Destination $Destination
    $svn = Join-Path $Destination 'svn.exe'
    Copy-Item -LiteralPath $client[0].FullName -Destination $svn

    # Modify the private copy so CLI arguments use UTF-8 on Windows.
    $mt = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\mt.exe" |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $mt) { throw 'Windows SDK manifest tool not found' }
    $manifest = Join-Path $work 'client.manifest'
    & $mt.FullName "-inputresource:$svn;#1" "-out:$manifest"
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the SVN executable manifest' }
    $xml = [System.Xml.XmlDocument]::new()
    $xml.Load($manifest)
    $application = $xml.SelectSingleNode("//*[local-name()='application']")
    if (-not $application) {
        $application = $xml.CreateElement('application', 'urn:schemas-microsoft-com:asm.v3')
        [void]$xml.DocumentElement.AppendChild($application)
    }
    $settings = $application.SelectSingleNode("*[local-name()='windowsSettings']")
    if (-not $settings) {
        $settings = $xml.CreateElement('windowsSettings', $application.NamespaceURI)
        [void]$application.AppendChild($settings)
    }
    $codePage = $settings.SelectSingleNode("*[local-name()='activeCodePage']")
    if (-not $codePage) {
        $codePage = $xml.CreateElement('activeCodePage', 'http://schemas.microsoft.com/SMI/2019/WindowsSettings')
        [void]$settings.AppendChild($codePage)
    }
    $codePage.InnerText = 'UTF-8'
    $xml.Save($manifest)
    & $mt.FullName '-manifest' $manifest "-outputresource:$svn;#1"
    if ($LASTEXITCODE -ne 0) { throw 'Could not embed the SVN UTF-8 manifest' }

    'StoneSVN modifies the manifest of svn.exe to select the UTF-8 code page.' |
        Set-Content -LiteralPath (Join-Path $licenses 'StoneSVN-modifications.txt') -Encoding utf8
    $version = & $svn --version --quiet
    if ($LASTEXITCODE -ne 0 -or $version -ne '1.14.5') {
        throw "Unexpected SVN version: $version"
    }
    Write-Output $version
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
