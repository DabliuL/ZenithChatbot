[Setup]
; Informações básicas do programa
AppName=Zenith Chatbot
AppVersion=1.0
AppPublisher=Sua Agência / Desenvolvedor
; Onde o programa será instalado (Arquivos de Programas)
DefaultDirName={autopf}\ZenithChatbot
DefaultGroupName=Zenith Chatbot
; Nome do arquivo do instalador final
OutputBaseFilename=Instalador_ZenithChatbot
Compression=lzma2
SolidCompression=yes
; Onde o Inno Setup vai salvar o instalador gerado
OutputDir=.\InstaladorFinal
; Ícone opcional (caso você tenha um .ico, remova o ponto e vírgula abaixo e coloque o caminho)
; SetupIconFile=Release\icone.ico

[Files]
; Copiando o executável
Source: "Release\ZenithChatbot.exe"; DestDir: "{app}"; Flags: ignoreversion

; Copiando a pasta media e todo o seu conteúdo
Source: "Release\media\*"; DestDir: "{app}\media"; Flags: ignoreversion recursesubdirs createallsubdirs

; Copiando o arquivo de configurações pré-salvas
Source: "Release\config_bot.json"; DestDir: "{app}"; Flags: ignoreversion

; Copiando a pasta do Chrome (necessário para o WhatsApp Web funcionar escondido)
Source: "Release\chrome-win\*"; DestDir: "{app}\chrome-win"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Criando atalho na Área de Trabalho
Name: "{autodesktop}\Zenith Chatbot"; Filename: "{app}\ZenithChatbot.exe"

; Criando atalhos no Menu Iniciar
Name: "{group}\Zenith Chatbot"; Filename: "{app}\ZenithChatbot.exe"
Name: "{group}\Desinstalar Zenith Chatbot"; Filename: "{uninstallexe}"

[Run]
; Oferecer para abrir o programa logo após terminar a instalação
Filename: "{app}\ZenithChatbot.exe"; Description: "Iniciar o Zenith Chatbot agora"; Flags: nowait postinstall skipifsilent
