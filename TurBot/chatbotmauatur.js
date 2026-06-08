const { exec } = require('child_process');
const hideConsoleScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
}
"@;
Add-Type -TypeDefinition $code;
[Win32]::ShowWindow([Win32]::GetConsoleWindow(), 0);
`;
exec(`powershell -command "${hideConsoleScript.replace(/\n/g, ' ')}"`);

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require("socket.io");
const cors = require('cors');
const open = require('open');
const fs = require('fs');

const app = express();
app.use(cors());
// Servir arquivos do React compilado, que estarão embutidos no exe
app.use(express.static(path.join(__dirname, 'public-web')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let botStatus = 'disconnected';
let qrCodeData = '';
let isPaused = false;

const lastInteractions = {};
const supportCooldown = {};
const bootTime = Date.now();

// Basepath apontando para a pasta onde o .exe está localizado
const basePath = process.pkg ? path.dirname(process.execPath) : process.cwd();
const chromiumPath = path.join(basePath, 'chrome-win', 'chrome.exe');
const statusBotPath = path.join(basePath, 'status_bot.json');

// Configurações do Atualizador Automático (Auto-Updater)
const CURRENT_VERSION = '1.1.1';
const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/DabliuL/ZenithChatbot/main/version.json';
let updateStatus = { available: false, version: '', url: '', changelog: '' };

function checkForUpdates() {
    return new Promise((resolve) => {
        https.get(VERSION_CHECK_URL, (res) => {
            if (res.statusCode !== 200) {
                logToFile(`Falha ao checar atualizações: Status HTTP ${res.statusCode}`, 'WARNING');
                resolve();
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const remote = JSON.parse(data);
                    if (remote.version && remote.version !== CURRENT_VERSION) {
                        updateStatus = {
                            available: true,
                            version: remote.version,
                            url: remote.url,
                            changelog: remote.changelog
                        };
                        logToFile(`[ATUALIZADOR] Nova versão disponível: v${remote.version}`);
                        io.emit('update_status', updateStatus);
                    } else {
                        updateStatus.available = false;
                        io.emit('update_status', updateStatus);
                    }
                } catch (e) {
                    logToFile(`Falha ao processar version.json: ${e.message}`, 'WARNING');
                }
                resolve();
            });
        }).on('error', (err) => {
            logToFile(`Falha ao checar atualizações: ${err.message}`, 'WARNING');
            resolve();
        });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Erro HTTP ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function logToFile(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const formattedMessage = `[${timestamp}] [${level}] ${message}\n`;
    console.log(formattedMessage.trim());
    try {
        fs.appendFileSync(path.join(basePath, 'chatbot.log'), formattedMessage, 'utf8');
    } catch (err) {
        console.error('Falha ao escrever no arquivo de log:', err);
    }
}

// Ouvintes globais de erro
process.on('uncaughtException', (err) => {
    logToFile(`EXCEÇÃO NÃO TRATADA: ${err.message}\n${err.stack}`, 'CRITICAL');
});
process.on('unhandledRejection', (reason, promise) => {
    logToFile(`PROMESSA NÃO TRATADA: ${reason}`, 'WARNING');
});

// Carregar status de recuperação anterior
let botRecoveryStatus = { lastRestartReason: null, lastRestartTime: null };
try {
    if (fs.existsSync(statusBotPath)) {
        botRecoveryStatus = JSON.parse(fs.readFileSync(statusBotPath, 'utf8'));
    }
} catch (err) {
    logToFile(`Erro ao ler status_bot.json: ${err.message}`, 'ERROR');
}

const configPath = path.join(basePath, 'config_bot.json');
const defaultTexts = {
    menu_principal: "Olá, Viajante! Mauá Tur agradece o seu contato!\n\nEstamos muito felizes por você escolher viajar com a gente 💙\n\nDevido ao alto volume de mensagens, nosso atendimento pode demorar um pouquinho, mas responderemos o mais breve possível.\n\n📞 Caso seja urgente, pode nos ligar!\nFalamos 🇧🇷 | Hablamos 🇪🇸 | We speak 🇬🇧\n\n✈️ Entre no nosso grupo e acompanhe promoções, pacotes e novidades:\nhttps://chat.whatsapp.com/EhNLXosli4M9cg0CrlmqrF\n\n🕒 Horário de atendimento:\nSegunda a sábado, das 10h às 18h.\n\n*Escolha uma opção para agilizar seu atendimento:*\n\n1️⃣ Quem somos\n2️⃣ Horário de atendimento\n3️⃣ Viagens\n4️⃣ Passeios bate e volta\n5️⃣ Documentação turística\n6️⃣ Fazer um orçamento\n7️⃣ Cruzeiro\n8️⃣ Entrar no grupo de novidades\n9️⃣ Falar com atendente\n\nSerá um prazer planejar sua próxima viagem com você! 🌎",
    opcao_1: "Olá, viajante! 🌍\n\nSomos a Mauá Tur, a sua parceira de aventuras!\n\nAcreditamos que viajar é colecionar momentos inesquecíveis, e nossa missão é transformar o seu roteiro dos sonhos em realidade.\n\nMais do que uma agência, somos apaixonadas por conectar pessoas a experiências únicas, criando roteiros pensados nos mínimos detalhes para cada cliente. Cada viagem tem um significado, por isso trabalhamos de forma personalizada, entendendo o seu perfil e suas preferências.\n\nPor trás da Mauá Tur estão Ingrid e Rafaele, que cuidam de cada etapa da sua viagem com atenção, carinho e responsabilidade. Nosso objetivo é que você se sinta seguro(a), bem atendido(a) e confiante do início ao fim.\n\n​Trabalhamos com:\n✈️ Passagens aéreas\n🏨 Hospedagens\n🌍 Pacotes turísticos (lazer ou corporativos)\n 🚌 Passeios bate e volta\n🛳️ Cruzeiros\n🛡️ Seguro viagem\n🚗 Aluguel de carro\n💱 Câmbio de moeda estrangeira\n📋 Assessoria para documentação turística\n 🧳 Roteiros personalizados\n🎟️ Passeios e ingressos locais\n\nPlanejamos sua viagem de acordo com suas preferências, pra você viajar com quem quiser e sem preocupação. Cuidamos de tudo pra você só aproveitar ✨\n\nMe conta: qual tipo de viagem você está buscando? 😊",
    opcao_2: "Nosso horário de atendimento é:\n\n 📆 Segunda à sabádo (exceto feriados)\n ⏰ 10h às 18h\n\nCaso nos chame fora desse horário, pode deixar sua mensagem que responderemos o mais breve possível!",
    opcao_3: "Trabalhamos com viagens totalmente personalizadas, para qualquer lugar do Brasil ou do mundo!\n\nMontamos tudo de acordo com suas preferências, estilo de viagem e orçamento, cuidando de cada detalhe pra você viajar com tranquilidade e sem preocupação 💙\n\nMe conta:\n\n📍 Destino: para onde deseja viajar?\n👥 Passageiros: quantas pessoas irão?\n👶 Crianças: algum pequeno a bordo? (Se sim, nos diga as idades)\n\n🎫 Serviços desejados: Passagem aérea, Hospedagem, Aluguel de carro, Seguro viagem, Passeios no destino, Cruzeiro, Pacote completo\n\nBasta responder abaixo e nosso time cuidará de tudo! 🌟 Ou, se preferir, digite 9️⃣ para falar com um atendente!",
    opcao_4: "Confira nossos próximos passeios 🚌\n\nℹ️ INFORMAÇÕES IMPORTANTES:\n\n👶 Crianças:\n • Até 5 anos viajando no colo: grátis\n • Acima dessa idade: valor normal\n\n💳 FORMAS DE PAGAMENTO:\n\n1️⃣ Pix\n • R$ 50,00 de entrada no ato da reserva para passeios bate e volta\n • R$ 100,00 de entrada para passeios com hospedagem\n • Restante parcelado mensalmente, com quitação até 1 semana antes da viagem\n\n2️⃣ Cartão de crédito\n • Pagamento total no ato da reserva\n • Parcelamento em até 12x\n • Consulte as taxas\n\n*Valores sujeitos a alteração sem aviso prévio*\n\n⚠️ ATENÇÃO:\n • Passeio sujeito à formação de grupo mínimo de 15 a 30 passageiros (dependendo do roteiro)\n • As vagas são limitadas e mediante confirmação de pagamento\n\n📲 Para reservar sua vaga, clique no número 9 e converse com um atendente da Mauá Tur!",
    opcao_5: "Precisa de ajuda com documentação?\nA gente te orienta 📋✈️\n\nOferecemos assessoria para:\n\n📘 Passaporte\n🛂 Vistos e autorizações eletrônicas\n👶 Autorização para menores\n🌎 Documentos para viagens internacionais\n\nAlguns documentos que podem ser exigidos dependendo do destino:\n\n💉 Certificado Internacional de Vacinação (ex: febre amarela)\n🦠 Comprovante de vacinas específicas (quando exigido)\n📄 Seguro viagem (obrigatório em alguns países)\n🛃 Formulários de imigração ou entrada\n\nMe conta qual documento você precisa!",
    opcao_6: "✈️ Sua próxima viagem começa aqui!\n\nVamos montar um roteiro totalmente personalizado pra você, do jeitinho que deseja 💙\n\nPara isso, me envie algumas informações:\n\n📍 Destino: Para onde quer viajar?\n📅 Período: Quando pretende ir e por quantos dias? Tem flexibilidade?\n👥 Passageiros: Quantas pessoas irão?\n👶 Crianças: Vai ter algum pequeno? Se sim, qual a idade?\n\n🎫 Serviços desejados:\n• Passagem aérea\n• Hospedagem\n• Aluguel de carro\n• Seguro viagem\n• Passeios no destino\n• Pacote completo\n\nCom essas informações, nossa equipe prepara as melhores opções pra você!\n\nSe preferir, digite 9️⃣ para falar diretamente com um atendente 💬",
    opcao_7: "🚢✨ Cruzeiros incríveis te esperando!\n\nTrabalhamos com as melhores companhias do mercado, como a MSC Cruzeiros, Costa Cruzeiros e outras grandes empresas 🌍\n\nOs cruzeiros oferecem:\n\n🌎 Roteiros incríveis pelo Brasil, América do Sul, Caribe, Europa e diversos destinos ao redor do mundo! \n🛳️ Embarques em diversos portos, como Rio de Janeiro, Santos (SP) e vários outros no Brasil e no mundo\n🛏️ Acomodações confortáveis, com opções para todos os estilos e orçamentos\n🍽️ Pensão completa (todas as refeições inclusas)\n🎭 Lazer a bordo com shows, festas, teatro, piscinas, cassino, spa, espaço kids e muito mais\n\n📅 Temporadas:\nNo Brasil, a temporada acontece geralmente de outubro a abril\nJá pelo mundo, há cruzeiros durante o ano inteiro\n\nVocê pode escolher:\n✨ Tipo de cabine\n✨ Datas\n✨ Destino\n\nE a gente cuida de tudo pra você, da reserva ao embarque 💼📲\n\nO que está incluso:\n🍽️ Todas as refeições (pensão completa)\n🎭 Entretenimento a bordo\n💲 Taxas portuárias, operacionais e de serviço de hotelaria\n\n⚠️ Não incluso:\n🍹 Bebidas alcoólicas (pacotes à parte)\n🛡️ Seguro viagem\n\nMe conta: você já tem alguma data ou destino em mente? 😊\n\nPosso montar as melhores opções pra você agora mesmo 🚢💙",
    opcao_8: "Te envio nossos grupos, para você acompanhar  😊\n\nNosso grupo de viagens e pacotes ✈️:\nhttps://chat.whatsapp.com/EhNLXosli4M9cg0CrlmqrF\n\nNosso grupo de passeios excursões 🚍\nhttps://chat.whatsapp.com/I040Awdzd7tDAw4DJ4hQX3",
    opcao_9: "Perfeito! Um dos nossos especialistas em viagens vai te atender em instantes!\n\nSó aguardar um pouquinho... ✈️💙",
    opcao_1_ativo: true,
    opcao_2_ativo: true,
    opcao_3_ativo: true,
    opcao_4_ativo: true,
    opcao_4_imagem_ativo: true,
    opcao_5_ativo: true,
    opcao_6_ativo: true,
    opcao_7_ativo: true,
    opcao_8_ativo: true,
    opcao_9_ativo: true,
    nome_opcao_1: "Quem somos", keywords_opcao_1: "quem somos",
    nome_opcao_2: "Horários", keywords_opcao_2: "horário, horario",
    nome_opcao_3: "Viagens", keywords_opcao_3: "viagens",
    nome_opcao_4: "Passeios", keywords_opcao_4: "passeios",
    nome_opcao_5: "Documentação", keywords_opcao_5: "documentação, documentacao",
    nome_opcao_6: "Orçamento", keywords_opcao_6: "orçamento, orcamento",
    nome_opcao_7: "Cruzeiros", keywords_opcao_7: "cruzeiro, cruzeiros",
    nome_opcao_8: "Grupos", keywords_opcao_8: "grupo de viagens, grupo de passeios, grupo de novidades",
    nome_opcao_9: "Atendimento Humano", keywords_opcao_9: "atendente, atendimento",
    kw_passaporte_ativo: true, kw_passaporte_nome: "Passaporte", kw_passaporte_gatilhos: "passaporte, passport", kw_passaporte_resposta: "Sobre o passaporte, a gente cuida de toda a parte burocrática pra você.\n\nNo suporte você recebe:\n✅ Preenchimento do formulário\n✅ Agendamento na Polícia Federal\n✅ Orientações sobre documentos\n✅ Acompanhamento antes, durante e depois\n\nVocê só precisa ir no dia agendado para tirar foto e coletar as digitais 😊\n\nValores:\n👉 Taxa da Polícia Federal: R$ 257,25\n👉 Nosso suporte: R$ 92,75\n💰 Total: R$ 350,00\n\nPara iniciar, preencha o formulário:\nhttps://docs.google.com/forms/d/1ESf3YZbiq84aTmOUesQ1y6nk0IQchgPSqiD96YB8O7k/edit\n\nDepois é só realizar o pagamento via PIX. Assim que recebermos tudo, damos andamento no processo.",
    kw_eta_ativo: true, kw_eta_nome: "ETA Reino Unido", kw_eta_gatilhos: "eta reino unido, reino unido, eta", kw_eta_resposta: "Oferecemos suporte completo para solicitação do ETA do Reino Unido 🇬🇧\n\nO ETA é uma autorização eletrônica de viagem feita 100% online.\n\nComo funciona:\nSolicitamos seus dados, fazemos o preenchimento e acompanhamos todo o processo.\nSe o sistema pedir algo extra, te orientamos em cada etapa.\n\n⏱️ Prazo:\nNormalmente sai em poucas horas, podendo levar até 72h (prazo oficial).\n\n💰 Valor total (taxa + assessoria): R$ 500,00",
    kw_mexico_ativo: true, kw_mexico_nome: "Visto Mexicano", kw_mexico_gatilhos: "visto mexicano, e-visa, mexico, méxico", kw_mexico_resposta: "Oferecemos suporte completo para o visto eletrônico do México 🇲🇽\n\nO processo é online e nós cuidamos de tudo pra você.\n\nInclui:\n✅ Preenchimento\n✅ Orientação completa\n✅ Acompanhamento da solicitação\n\n💰 Valor total (taxa + assessoria): R$ 500,00\n\nCaso seja necessário algo adicional, te orientamos durante o processo.",
    kw_eua_ativo: true, kw_eua_nome: "Visto Americano", kw_eua_gatilhos: "visto americano, visto america, visto eua, visto estados unidos", kw_eua_resposta: "Sobre o visto americano 🇺🇸\n\nTaxa consular:\n💵 US$ 185 (valor do consulado, pago pelo cliente)\n\nNossa assessoria: R$ 800,00\n\nInclui:\n✅ Orientação completa do processo\n✅ Preenchimento do formulário DS-160\n✅ Agendamento no CASV\n✅ Agendamento da entrevista no Consulado\n\nTe acompanhamos em todas as etapas pra aumentar suas chances e evitar erros.",
    kw_menor_ativo: true, kw_menor_nome: "Autorização para Menor", kw_menor_gatilhos: "autorizacao para menor, autorização para menor, menor de idade, viagem com menor", kw_menor_resposta: "Se a viagem envolve menores de idade, a autorização é essencial 👶✈️\n\nEla é obrigatória quando:\n- O menor viaja desacompanhado\n- Viaja com apenas um dos responsáveis\n- Ou com terceiros\n\nNós te ajudamos com:\n\n✅ Modelo correto da autorização\n✅ Orientação sobre preenchimento\n✅ Indicação de reconhecimento em cartório\n✅ Conferência de documentos\n\n💰 Valor da assessoria: R$ 80,00\n\nObs: Custos de cartório não inclusos.\n\nAssim você evita problemas no embarque e viaja com tranquilidade 😊",
    kw_seguro_ativo: true, kw_seguro_nome: "Seguro Viagem", kw_seguro_gatilhos: "seguro viagem, seguro de viagem", kw_seguro_resposta: "O seguro viagem é essencial e, em muitos destinos, obrigatório 🌎✈️\n\nExemplo: países da Europa que fazem parte do Tratado de Schengen exigem cobertura mínima.\n\nO seguro cobre:\n🏥 Atendimento médico e hospitalar\n💊 Medicamentos\n✈️ Cancelamentos e imprevistos\n🧳 Extravio de bagagem\n🚑 Assistência emergencial\n\nTrabalhamos com as melhores seguradoras e buscamos a melhor opção pra você.\n\n💰 Valores variam de acordo com:\n- Destino\n- Quantidade de dias\n- Idade do viajante\n\nMe informa seu destino e datas que te envio as melhores opções 😊",
    kw_vacina_ativo: true, kw_vacina_nome: "Vacina", kw_vacina_gatilhos: "vacina, vacinacao, vacinação, febre amarela", kw_vacina_resposta: "Alguns destinos exigem vacinas específicas 💉🌎\n\nA principal é:\n🟡 Febre amarela (com emissão do Certificado Internacional)\n\nOutras podem ser solicitadas dependendo do país, como:\n- COVID-19 (em alguns casos específicos)\n- Outras recomendações sanitárias\n\nNós te orientamos com:\n✅ Quais vacinas são obrigatórias para seu destino\n✅ Onde emitir o Certificado Internacional (ANVISA)\n✅ Prazos necessários antes da viagem\n\n💰 Orientação inclusa na assessoria de viagem ou sob consulta\n\nAssim você evita ser barrado na imigração 😉",
    kw_doc_ativo: true, kw_doc_nome: "Documentação Completa", kw_doc_gatilhos: "documentacao completa, documentação completa, documentacao, documentação", kw_doc_resposta: "Quer viajar sem dor de cabeça? A gente cuida de tudo pra você ✈️💙\n\nOferecemos assessoria completa para:\n📘 Passaporte\n🛂 Vistos\n🌎 Autorizações eletrônicas (ETA / e-visa)\n👶 Autorização para menores\n💉 Vacinas e certificados\n🛡️ Seguro viagem\n\nMontamos tudo de acordo com seu destino e perfil.\n\n👉 Você não precisa se preocupar com burocracia, erros ou falta de documentos.\n\nMe conta pra onde você vai e quando, que eu te oriento com tudo certinho 😊",
    kw_pix_ativo: true, kw_pix_nome: "Chave Pix", kw_pix_gatilhos: "pix, chave pix", kw_pix_resposta: "Nossa chave é o celular: \n21 987310795 \nZenith ou I A de Queiroz Viagens e Turismo",
    kw_visto_ativo: true, kw_visto_nome: "Visto Genérico", kw_visto_gatilhos: "visto", kw_visto_resposta: "Trabalhamos com assessoria para diversos tipos de vistos, incluindo turismo, estudo, trabalho e diversos destinos internacionais 🌍\n\nPara eu te passar as informações certinhas, me diz:\n • Qual país você deseja tirar o visto?\n • E qual o tipo de visto que você precisa?",
    kw_boleto_ativo: true, kw_boleto_nome: "Boleto", kw_boleto_gatilhos: "boleto, parcelado, parcelar", kw_boleto_resposta: "💳 Pagamento via boleto\n\nTrabalhamos com diferentes formas de pagamento em boleto, e as condições podem variar conforme o tipo de viagem e análise de crédito.\n\n📌 Em geral, funciona assim:\n\n✔️ A opção de boleto está sujeita à análise de crédito\n✔️ Após a aprovação, é definida a quantidade de parcelas disponíveis\n\n💰 Modalidades possíveis:\n\n✔️ Primeira parcela no ato da contratação + restante parcelado no boleto\n\nou\n\n✔️ Entrada de aproximadamente 10% via Pix + restante parcelado no boleto (com vencimento a partir do mês seguinte)\n\nAs condições são definidas de acordo com cada reserva.\n\nSe quiser, posso verificar pra você as melhores condições disponíveis 😊",
    respostas_customizadas: []
};

let botConfig = { ...defaultTexts };
try {
    if (fs.existsSync(configPath)) {
        botConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Migração da antiga opção 4
        if (botConfig.opcao_4_fim && !botConfig.opcao_4) {
            botConfig.opcao_4 = botConfig.opcao_4_fim;
            delete botConfig.opcao_4_inicio;
            delete botConfig.opcao_4_fim;
        }
        botConfig = { ...defaultTexts, ...botConfig };
    } else {
        fs.writeFileSync(configPath, JSON.stringify(botConfig, null, 2));
    }
} catch (e) {
    console.error("Erro ao carregar config", e);
}

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "client-one", dataPath: path.join(basePath, '.wwebjs_auth') }),
    puppeteer: {
        headless: true,
        executablePath: chromiumPath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--hide-scrollbars',
            '--disable-notifications',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa',
            '--disable-gl-drawing-for-tests',
            '--disable-dev-resourceload-throttling',
            '--js-flags="--max-old-space-size=2048"'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// Envelopar a função de envio para suportar retentativas (Retry Logic) de forma transparente
const originalSendMessage = client.sendMessage.bind(client);
client.sendMessage = async function(to, content, options = {}) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            return await originalSendMessage(to, content, options);
        } catch (err) {
            attempts++;
            logToFile(`Falha ao enviar mensagem para ${to} (Tentativa ${attempts}/${maxAttempts}): ${err.message}`, 'WARNING');
            if (attempts >= maxAttempts) throw err;
            await delay(1500);
        }
    }
};

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    botStatus = 'qr_ready';
    io.emit('qr', qr);
    io.emit('status', botStatus);
});

client.on('ready', () => {
    logToFile('Tudo certo! WhatsApp conectado.');
    botStatus = 'connected';
    qrCodeData = '';
    io.emit('status', botStatus);
    io.emit('qr', '');
});

client.on('authenticated', () => {
    logToFile('Autenticado com sucesso!');
    botStatus = 'authenticated';
    io.emit('status', botStatus);
});

client.on('auth_failure', msg => {
    logToFile(`Falha na autenticação: ${msg}`, 'ERROR');
    botStatus = 'auth_failure';
    io.emit('status', botStatus);
});

client.on('disconnected', async (reason) => {
    logToFile(`Cliente desconectado: ${reason}`, 'WARNING');
    botStatus = 'disconnected';
    io.emit('status', botStatus);
    
    try {
        fs.writeFileSync(statusBotPath, JSON.stringify({
            lastRestartReason: 'whatsapp_disconnection',
            lastRestartTime: new Date().toISOString()
        }, null, 2), 'utf8');
    } catch (err) {}

    try {
        logToFile('Encerrando sessão anterior do navegador...');
        await client.destroy();
    } catch(e) {
        logToFile(`Aviso ao destruir cliente: ${e.message}`, 'WARNING');
    }
    
    try {
        const authPath = path.join(basePath, '.wwebjs_auth');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            logToFile('Pasta de autenticação removida com sucesso.');
        }
    } catch (err) {
        logToFile(`Erro ao remover pasta de autenticação: ${err.message}`, 'ERROR');
    }
    
    logToFile('Reiniciando o aplicativo para gerar um novo QR Code de forma limpa (anti-travamento)...');
    
    try {
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } catch(err) {
        logToFile(`Erro ao tentar reiniciar o executável: ${err.message}`, 'ERROR');
    }

    process.exit(0);
});

io.on('connection', (socket) => {
    logToFile(`Novo cliente conectado ao painel web: ${socket.id}`);
    socket.emit('status', botStatus);
    socket.emit('paused_state', isPaused);
    socket.emit('recovery_status', botRecoveryStatus);
    socket.emit('update_status', updateStatus);
    if (qrCodeData) {
        socket.emit('qr', qrCodeData);
    }

    socket.on('toggle_pause', (pauseState) => {
        isPaused = pauseState;
        logToFile(`Bot ${isPaused ? 'pausado' : 'retomado'} pelo painel.`);
        io.emit('paused_state', isPaused);
    });

    socket.on('request_config', () => {
        socket.emit('config_data', botConfig);
    });

    socket.on('save_config', (newConfig) => {
        try {
            botConfig = { ...botConfig, ...newConfig };
            fs.writeFileSync(configPath, JSON.stringify(botConfig, null, 2));
            io.emit('config_data', botConfig);
            logToFile('Configurações salvas e atualizadas com sucesso.');
        } catch (e) {
            logToFile(`Erro ao salvar config: ${e.message}`, 'ERROR');
        }
    });

    socket.on('shutdown', () => {
        logToFile('Comando de encerramento recebido pelo painel.');
        process.exit(0);
    });

    socket.on('restart_clean', async () => {
        logToFile('Comando de reinício limpo recebido pelo painel.');
        try {
            fs.writeFileSync(statusBotPath, JSON.stringify({
                lastRestartReason: 'manual_restore',
                lastRestartTime: new Date().toISOString()
            }, null, 2), 'utf8');
        } catch (err) {}
        
        io.emit('status', 'restarting');
        io.emit('restarting_event', 'manual_restore');
        await delay(2000);

        try {
            await client.destroy();
        } catch(e) {}
        
        try {
            const authPath = path.join(basePath, '.wwebjs_auth');
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
            }
            const cachePath = path.join(basePath, '.wwebjs_cache');
            if (fs.existsSync(cachePath)) {
                fs.rmSync(cachePath, { recursive: true, force: true });
            }
            logToFile('Pastas de autenticação e cache removidas via painel.');
        } catch (err) {}
        
        try {
            const { spawn } = require('child_process');
            const child = spawn(process.execPath, [], { detached: true, stdio: 'ignore' });
            child.unref();
        } catch(err) {}
        process.exit(0);
    });

    socket.on('trigger_update', async () => {
        if (!updateStatus.available || !updateStatus.url) {
            logToFile('[ATUALIZADOR] Nenhuma atualização disponível ou URL inválido.', 'WARNING');
            return;
        }

        logToFile(`[ATUALIZADOR] Iniciando atualização para a versão v${updateStatus.version}...`);
        botStatus = 'updating';
        io.emit('status', botStatus);

        const destPath = path.join(basePath, 'ZenithChatbot_new.exe');
        try {
            await downloadFile(updateStatus.url, destPath);
            logToFile('[ATUALIZADOR] Download concluído com sucesso. Criando script de instalação...');

            const batPath = path.join(basePath, 'update.bat');
            const batContent = `@echo off
timeout /t 2 /nobreak > nul
taskkill /F /IM ZenithChatbot.exe > nul 2>&1
del /f /q ZenithChatbot.exe
rename ZenithChatbot_new.exe ZenithChatbot.exe
start ZenithChatbot.exe
del "%~f0"
`;
            fs.writeFileSync(batPath, batContent, 'utf8');

            logToFile('[ATUALIZADOR] Executando script de atualização e encerrando processo atual...');
            
            // Encerra sessão do bot se estiver conectada
            try {
                await client.destroy();
            } catch (e) {}

            const { spawn } = require('child_process');
            const child = spawn('cmd.exe', ['/c', batPath], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            process.exit(0);
        } catch (err) {
            logToFile(`[ATUALIZADOR] Erro durante a atualização: ${err.message}`, 'ERROR');
            botStatus = 'connected'; // fallback status
            io.emit('status', botStatus);
        }
    });

    socket.on('disconnect', () => {
        logToFile(`Cliente desconectado do painel web: ${socket.id}`);
    });
});

const delay = ms => new Promise(res => setTimeout(res, ms));

// ============================================================
// FUNÇÃO: Reinício Diário de Manutenção (4:00 AM)
// Libera memória RAM sem deslogar (não apaga a pasta auth)
// ============================================================
async function executeMaintenanceRestart(reason = 'daily_maintenance') {
    logToFile(`Iniciando reinício de auto-recuperação/manutenção. Motivo: ${reason}`);
    try {
        fs.writeFileSync(statusBotPath, JSON.stringify({
            lastRestartReason: reason,
            lastRestartTime: new Date().toISOString()
        }, null, 2), 'utf8');
    } catch (err) {
        logToFile(`Erro ao gravar status_bot.json: ${err.message}`, 'ERROR');
    }

    io.emit('status', 'restarting');
    io.emit('restarting_event', reason);
    await delay(2000);

    try {
        logToFile('[MANUTENÇÃO] Encerrando sessão do navegador para liberar memória...');
        await client.destroy();
    } catch(e) {}
    
    try {
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, [], { detached: true, stdio: 'ignore' });
        child.unref();
    } catch(err) {
        logToFile(`Erro ao tentar reiniciar: ${err.message}`, 'ERROR');
    }
    process.exit(0);
}

function scheduleDailyRestart() {
    const now = new Date();
    const restartTime = new Date();
    restartTime.setHours(4, 0, 0, 0); // 4 da manhã

    // Se já passou das 4h da manhã hoje, agenda para amanhã
    if (now > restartTime) {
        restartTime.setDate(restartTime.getDate() + 1);
    }

    const timeUntilRestart = restartTime.getTime() - now.getTime();
    logToFile(`[SISTEMA] Reinício diário programado para daqui a ${(timeUntilRestart / 1000 / 60 / 60).toFixed(1)} horas (04:00 AM).`);

    setTimeout(() => {
        logToFile('[SISTEMA] Iniciando reinício diário de manutenção...');
        executeMaintenanceRestart('daily_maintenance');
    }, timeUntilRestart);
}

scheduleDailyRestart();

// ============================================================
// FUNÇÃO: Monitoramento de Sinais Vitais (Ping/Health Check)
// ============================================================
function startHealthCheck() {
    setInterval(async () => {
        if (botStatus !== 'connected') return; 

        try {
            logToFile('[HEALTH CHECK] Verificando se o navegador ainda está vivo...');
            const checkState = client.getState();
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Ping Timeout')), 15000)); // 15 segundos
            
            const state = await Promise.race([checkState, timeout]);
            logToFile(`[HEALTH CHECK] Tudo OK! Estado: ${state}`);
        } catch (error) {
            logToFile('[ERRO CRÍTICO] Navegador congelou e não respondeu ao Ping! Iniciando ressurreição automática...', 'CRITICAL');
            executeMaintenanceRestart('health_check_failure');
        }
    }, 60 * 60 * 1000); // 1 hora
}

startHealthCheck();

// ============================================================
// FUNÇÃO AUXILIAR: normaliza o texto removendo acentos e
// convertendo para minúsculas, facilitando a comparação.
// ============================================================
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // remove acentos
}

// ============================================================
// FUNÇÃO AUXILIAR: transforma string de keywords em array
// ============================================================
function getKwArray(kwString) {
    if (!kwString) return [];
    return kwString.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// ============================================================
// FUNÇÃO AUXILIAR: verifica se alguma das palavras-chave
// aparece EM QUALQUER PARTE da mensagem do usuário.
// Uso: contemKeyword(msg, ['passaporte', 'passport'])
// ============================================================
function contemKeyword(mensagem, keywords) {
    if (!keywords || keywords.length === 0) return false;
    const msgNorm = normalizar(mensagem);
    return keywords.some(kw => {
        const kwNorm = normalizar(kw);
        // Escapa caracteres especiais de regex
        const escapedKw = kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Usa \b para garantir que encontre a palavra isolada (ou no início/fim)
        const regex = new RegExp(`\\b${escapedKw}\\b`);
        return regex.test(msgNorm);
    });
}

// ============================================================
// LISTENER PRINCIPAL
// ============================================================
client.on('message', async msg => {
    if (isPaused) return;

    const messageTime = msg.timestamp * 1000;
    if (messageTime < bootTime) return;

    // Apenas responder a tipos de mensagens comuns de usuários.
    const allowedTypes = ['chat', 'image', 'video', 'audio', 'ptt', 'document', 'sticker'];
    if (!allowedTypes.includes(msg.type) || msg.isStatus) {
        return;
    }

    if (!msg.from.endsWith('@c.us') && !msg.from.endsWith('@lid')) {
        return;
    }

    try {
        logToFile(`[PROCESSO] Nova mensagem recebida de ${msg.from}`);
        const chat = await msg.getChat();
        const userId = msg.from;
        const now = Date.now();
        const threeHours = 3 * 60 * 60 * 1000; // 3 horas em milissegundos
        const FIFTEEN_MINUTES = 15 * 60 * 1000; // 15 minutos em milissegundos

    const name = msg._data.notifyName || "usuário";
    const firstName = name.split(" ")[0];

    if (supportCooldown[userId]) {
        if (now - supportCooldown[userId] < FIFTEEN_MINUTES) {
            console.log(`[SUPORTE] Mensagem de ${userId} ignorada dentro da janela de 15 min.`);
            return; // Sai do código e não responde o cliente
        } else {
            // Já se passaram 15 minutos, liberamos o usuário
            delete supportCooldown[userId];
            delete lastInteractions[userId]; // Reseta para ele poder receber o menu de novo
            console.log(`[SUPORTE] Janela de 15 min expirada para ${userId}. Bot reativado.`);
        }
    }

    const isFirstMessageInWindow = !lastInteractions[userId] || (now - lastInteractions[userId] > threeHours);

    if (isFirstMessageInWindow) {
        lastInteractions[userId] = now;
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.menu_principal, { sendSeen: false });
        return;
    }

    const userMessage = msg.body.trim();

    // ============================================================
    // OPÇÕES NUMÉRICAS E SUAS KEYWORDS
    // ============================================================

    if (botConfig.opcao_1_ativo && (userMessage === '1' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_1)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_1, { sendSeen: false });

    } else if (botConfig.opcao_2_ativo && (userMessage === '2' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_2)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_2, { sendSeen: false });

    } else if (botConfig.opcao_3_ativo && (userMessage === '3' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_3)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_3, { sendSeen: false });

    } else if (botConfig.opcao_4_ativo && (userMessage === '4' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_4)))) {
        await chat.sendStateTyping();
        await delay(1000);
        if (botConfig.opcao_4_imagem_ativo) {
            await client.sendMessage(msg.from, MessageMedia.fromFilePath(path.join(basePath, 'media', 'passeio.jpeg')), { caption: ' ' });
            await delay(1000);
        }
        await client.sendMessage(msg.from, botConfig.opcao_4, { sendSeen: false });

    } else if (botConfig.opcao_5_ativo && (userMessage === '5' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_5)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_5, { sendSeen: false });

    } else if (botConfig.opcao_6_ativo && (userMessage === '6' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_6)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_6, { sendSeen: false });

    } else if (botConfig.opcao_7_ativo && (userMessage === '7' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_7)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_7, { sendSeen: false });

    } else if (botConfig.opcao_8_ativo && (userMessage === '8' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_8)))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.opcao_8, { sendSeen: false });

    } else if (botConfig.opcao_9_ativo && (userMessage === '9' || contemKeyword(userMessage, getKwArray(botConfig.keywords_opcao_9)))) {
        await chat.sendStateTyping();
        await delay(1000);
        supportCooldown[userId] = Date.now();
        await client.sendMessage(msg.from, botConfig.opcao_9, { sendSeen: false });

        // ============================================================
        // PALAVRAS-CHAVE AVULSAS (GATILHOS)
        // ============================================================

    } else if (botConfig.kw_passaporte_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_passaporte_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_passaporte_resposta, { sendSeen: false });

    } else if (botConfig.kw_eta_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_eta_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_eta_resposta, { sendSeen: false });

    } else if (botConfig.kw_mexico_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_mexico_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_mexico_resposta, { sendSeen: false });

    } else if (botConfig.kw_eua_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_eua_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_eua_resposta, { sendSeen: false });

    } else if (botConfig.kw_menor_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_menor_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_menor_resposta, { sendSeen: false });

    } else if (botConfig.kw_seguro_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_seguro_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_seguro_resposta, { sendSeen: false });

    } else if (botConfig.kw_vacina_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_vacina_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_vacina_resposta, { sendSeen: false });

    } else if (botConfig.kw_doc_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_doc_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_doc_resposta, { sendSeen: false });

    } else if (botConfig.kw_pix_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_pix_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_pix_resposta, { sendSeen: false });

    } else if (botConfig.kw_visto_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_visto_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_visto_resposta, { sendSeen: false });

    } else if (botConfig.kw_boleto_ativo && contemKeyword(userMessage, getKwArray(botConfig.kw_boleto_gatilhos))) {
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(msg.from, botConfig.kw_boleto_resposta, { sendSeen: false });
    } else {
        if (botConfig.respostas_customizadas && Array.isArray(botConfig.respostas_customizadas)) {
            for (const resp of botConfig.respostas_customizadas) {
                if (resp.ativo && contemKeyword(userMessage, getKwArray(resp.gatilhos))) {
                    await chat.sendStateTyping();
                    await delay(1000);
                    await client.sendMessage(msg.from, resp.resposta, { sendSeen: false });
                    break;
                }
            }
        }
    }
    } catch (err) {
        logToFile(`Erro ao processar mensagem de ${msg.from}: ${err.message}\n${err.stack}`, 'ERROR');
    }
});

client.initialize().catch(err => {
    logToFile(`ERRO AO INICIALIZAR O CLIENTE: ${err.message}\n${err.stack}`, 'CRITICAL');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
    logToFile(`Servidor do painel web rodando na porta ${PORT}`);
    checkForUpdates();
    try {
        await open(`http://localhost:${PORT}`);
    } catch (e) { }
});