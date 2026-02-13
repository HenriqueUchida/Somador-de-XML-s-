const fileInput = document.getElementById('fileInput');
const btnDownload = document.getElementById('btnDownload');
const parser = new DOMParser();



// Variável global para guardar os dados prontos para o CSV
let dadosParaCsv = [];

fileInput.addEventListener('change', async function (e) {
    const files = e.target.files;
    if (files.length === 0) return;

    // Resetar UI
    document.getElementById('loading').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('actionArea').style.display = 'none';
    dadosParaCsv = []; // Limpa memória anterior

    const vendasMap = new Map();
    const chavesCanceladas = new Set();

    // 1. Leitura
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith('.xml')) {
            try {
                const text = await file.text();
                processarArquivo(text, vendasMap, chavesCanceladas);
            } catch (err) {
                console.error("Erro ao ler", file.name);
            }
        }
    }

    // 2. Cálculo e Preparação do CSV
    let totalNFCe = 0; let qtdNFCe = 0;
    let totalSAT = 0; let qtdSAT = 0;
    let totalCanc = 0;

    vendasMap.forEach((dados, chave) => {
        if (chavesCanceladas.has(chave)) {
            // É cancelado
            totalCanc += dados.valor;
        } else {
            // É válido
            if (dados.tipo === 'NFCe') {
                totalNFCe += dados.valor;
                qtdNFCe++;
            } else {
                totalSAT += dados.valor;
                qtdSAT++;
            }

            // Adiciona na lista de exportação (incluindo o CAIXA)
            dadosParaCsv.push({
                cnpj: dados.cnpj,
                chave: chave,
                valor: dados.valor,
                tipo: dados.tipo,
                caixa: dados.caixa
            });
        }
    });

    // 3. Atualiza a Tela
    atualizarDashboard(totalNFCe, qtdNFCe, totalSAT, qtdSAT, totalCanc, chavesCanceladas.size);
});

// Função de Parse
function processarArquivo(xmlText, vendasMap, chavesCanceladas) {
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // --- NFC-e ---
    const infNFe = xmlDoc.getElementsByTagName("infNFe")[0];
    if (infNFe) {
        const vNF = xmlDoc.getElementsByTagName("vNF")[0];
        const emit = xmlDoc.getElementsByTagName("emit")[0];
        let chave = infNFe.getAttribute("Id");

        // Pega a SÉRIE da nota para usar como Caixa
        const serie = xmlDoc.getElementsByTagName("serie")[0]?.textContent || "";

        if (chave && vNF) {
            chave = chave.replace('NFe', '');
            let cnpj = emit ? emit.getElementsByTagName("CNPJ")[0]?.textContent : "";

            vendasMap.set(chave, {
                valor: parseFloat(vNF.textContent),
                tipo: 'NFCe',
                cnpj: cnpj,
                caixa: serie // Série = Caixa na NFC-e
            });
            return;
        }
    }

    // --- SAT ---
    const infCFe = xmlDoc.getElementsByTagName("infCFe")[0];
    if (infCFe && !xmlDoc.getElementsByTagName("CFeCanc")[0]) {
        const vCFe = xmlDoc.getElementsByTagName("vCFe")[0];
        const emit = xmlDoc.getElementsByTagName("emit")[0];
        let chave = infCFe.getAttribute("Id");

        // Pega o numeroCaixa do SAT
        const numCaixa = xmlDoc.getElementsByTagName("numeroCaixa")[0]?.textContent || "";

        if (chave && vCFe) {
            chave = chave.replace('CFe', '');
            let cnpj = emit ? emit.getElementsByTagName("CNPJ")[0]?.textContent : "";

            vendasMap.set(chave, {
                valor: parseFloat(vCFe.textContent),
                tipo: 'SAT',
                cnpj: cnpj,
                caixa: numCaixa // Tag numeroCaixa no SAT
            });
            return;
        }
    }

    // --- CANCELAMENTOS ---
    const evento = xmlDoc.getElementsByTagName("infEvento")[0];
    if (evento) {
        const tpEvento = xmlDoc.getElementsByTagName("tpEvento")[0];
        if (tpEvento && tpEvento.textContent === '110111') {
            const chNFe = xmlDoc.getElementsByTagName("chNFe")[0];
            if (chNFe) chavesCanceladas.add(chNFe.textContent);
        }
    }

    const cfeCanc = xmlDoc.getElementsByTagName("CFeCanc")[0];
    if (cfeCanc) {
        const infCFeCanc = cfeCanc.getElementsByTagName("infCFe")[0];
        if (infCFeCanc) {
            const chCanc = infCFeCanc.getAttribute("chCanc");
            if (chCanc) chavesCanceladas.add(chCanc);
        }
    }
}

function atualizarDashboard(nfce, qNfce, sat, qSat, valCanc, qCanc) {
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('valNFCe').innerText = fmt.format(nfce);
    document.getElementById('qtdNFCe').innerText = qNfce;
    document.getElementById('valSAT').innerText = fmt.format(sat);
    document.getElementById('qtdSAT').innerText = qSat;
    document.getElementById('valCanc').innerText = fmt.format(valCanc);
    document.getElementById('qtdCanc').innerText = qCanc;
    document.getElementById('valTotal').innerText = fmt.format(nfce + sat);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';

    if ((qNfce + qSat) > 0) {
        document.getElementById('actionArea').style.display = 'block';
    }
}

btnDownload.addEventListener('click', function () {
    if (dadosParaCsv.length === 0) {
        alert("Nenhum dado válido para exportar.");
        return;
    }

    // Cabeçalho atualizado
    let csvContent = "CNPJ;Chave de Acesso;Caixa;Valor;Tipo\n";

    dadosParaCsv.forEach(row => {
        let valorFormatado = row.valor.toFixed(2).replace('.', ',');
        // Adicionado row.caixa
        csvContent += `${row.cnpj};${row.chave};${row.caixa};${valorFormatado};${row.tipo}\n`;
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "auditoria_fiscal_caixas.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});