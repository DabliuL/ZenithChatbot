import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

const socket = io('http://localhost:3001');

function App() {
  const [status, setStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartingReason, setRestartingReason] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    socket.on('status', (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'connected' || newStatus === 'qr_ready') {
        setIsRestarting(false);
      }
    });

    socket.on('qr', (qr) => {
      setQrCode(qr);
    });

    socket.on('paused_state', (paused) => {
      setIsPaused(paused);
    });

    socket.on('config_data', (data) => {
      setConfig(data);
      if (!editingConfig) {
        setEditingConfig(data);
      }
    });

    socket.on('restarting_event', (reason) => {
      setIsRestarting(true);
      setRestartingReason(reason);
    });

    socket.on('recovery_status', (recStatus) => {
      setRecoveryStatus(recStatus);
    });

    socket.on('update_status', (info) => {
      setUpdateInfo(info);
    });

    socket.on('disconnect', () => {
      // Quando o servidor cai, a menos que estejamos reiniciando deliberadamente, mostramos como desconectado
      setStatus('disconnected');
    });

    socket.emit('request_config');

    return () => {
      socket.off('status');
      socket.off('qr');
      socket.off('paused_state');
      socket.off('config_data');
      socket.off('restarting_event');
      socket.off('recovery_status');
      socket.off('update_status');
      socket.off('disconnect');
    };
  }, [editingConfig]);

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'qr_ready': return 'Aguardando QR Code';
      case 'authenticated': return 'Autenticando...';
      case 'auth_failure': return 'Falha na Autenticação';
      default: return 'Desconectado';
    }
  };

  const handleShutdown = () => {
    if (window.confirm("Tem certeza que deseja desligar o bot? Ele não responderá mais aos clientes até ser reiniciado.")) {
      socket.emit('shutdown');
      setStatus('shutdown_complete');
    }
  };

  const handleRestartClean = () => {
    if (window.confirm("ATENÇÃO: Isso vai apagar o cache e reiniciar o bot do zero. Você precisará escanear o QR Code novamente. Deseja prosseguir para destravar o sistema?")) {
      socket.emit('restart_clean');
      setStatus('shutdown_complete');
      setTimeout(() => {
        window.close();
      }, 1000);
    }
  };

  const handleTriggerUpdate = () => {
    if (window.confirm(`Deseja atualizar o robô para a versão v${updateInfo.version} agora? O sistema fará o download da nova versão e reiniciará automaticamente.`)) {
      socket.emit('trigger_update');
      setStatus('updating');
    }
  };

  const togglePause = () => {
    socket.emit('toggle_pause', !isPaused);
  };

  const handleSaveConfig = () => {
    socket.emit('save_config', editingConfig);
    alert('Configurações salvas com sucesso!');
  };

  const handleConfigChange = (key, value) => {
    setEditingConfig({
      ...editingConfig,
      [key]: value
    });
  };

  const handleCustomResponseChange = (index, field, value) => {
    const novasCustomizadas = [...(editingConfig.respostas_customizadas || [])];
    novasCustomizadas[index] = { ...novasCustomizadas[index], [field]: value };
    handleConfigChange('respostas_customizadas', novasCustomizadas);
  };

  const addCustomResponse = () => {
    const novasCustomizadas = [...(editingConfig.respostas_customizadas || [])];
    novasCustomizadas.push({
      id: Date.now().toString(),
      nome: "",
      gatilhos: "",
      resposta: "",
      ativo: true
    });
    handleConfigChange('respostas_customizadas', novasCustomizadas);
  };

  const removeCustomResponse = (index) => {
    if (window.confirm("Tem certeza que deseja excluir esta resposta customizada?")) {
      const novasCustomizadas = [...(editingConfig.respostas_customizadas || [])];
      novasCustomizadas.splice(index, 1);
      handleConfigChange('respostas_customizadas', novasCustomizadas);
    }
  };

  const renderOption = (num) => {
    if (!editingConfig) return null;
    const ativoKey = `opcao_${num}_ativo`;
    const textoKey = `opcao_${num}`;
    const nomeKey = `nome_opcao_${num}`;
    const kwKey = `keywords_opcao_${num}`;
    const isAtivo = editingConfig[ativoKey];

    return (
      <div style={{padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', opacity: isAtivo ? 1 : 0.6}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h3 style={{margin: 0, color: 'var(--text-primary)'}}>Opção {num} do Menu</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={isAtivo} onChange={(e) => handleConfigChange(ativoKey, e.target.checked)} />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Nome da Opção (Apenas para organização)</label>
            <input 
              type="text" 
              value={editingConfig[nomeKey] || ''} 
              onChange={(e) => handleConfigChange(nomeKey, e.target.value)}
              style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
              disabled={!isAtivo}
            />
          </div>
          <div>
            <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Gatilhos / Palavras-chave (separadas por vírgula)</label>
            <input 
              type="text" 
              value={editingConfig[kwKey] || ''} 
              onChange={(e) => handleConfigChange(kwKey, e.target.value)}
              style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
              disabled={!isAtivo}
              placeholder="Ex: passagens, voo"
            />
          </div>
        </div>

        {num === 4 && (
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid var(--border)'}}>
            <div>
              <strong style={{display: 'block', color: 'var(--text-primary)'}}>Enviar Imagem "passeio.jpeg"?</strong>
              <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>A imagem deve estar na pasta "media" do robô</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={editingConfig.opcao_4_imagem_ativo !== false} onChange={(e) => handleConfigChange('opcao_4_imagem_ativo', e.target.checked)} disabled={!isAtivo} />
              <span className="toggle-slider"></span>
            </label>
          </div>
        )}

        <div>
          <label style={{display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)'}}>Resposta do Bot</label>
          <textarea 
            value={editingConfig[textoKey] || ''} 
            onChange={(e) => handleConfigChange(textoKey, e.target.value)}
            style={{width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical'}}
            disabled={!isAtivo}
          />
        </div>
      </div>
    );
  };

  const renderAvulso = (prefixKey) => {
    if (!editingConfig) return null;
    const ativoKey = `kw_${prefixKey}_ativo`;
    const nomeKey = `kw_${prefixKey}_nome`;
    const gatilhosKey = `kw_${prefixKey}_gatilhos`;
    const respostaKey = `kw_${prefixKey}_resposta`;
    const isAtivo = editingConfig[ativoKey];

    return (
      <div style={{padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', opacity: isAtivo ? 1 : 0.6}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h3 style={{margin: 0, color: 'var(--text-primary)'}}>Configuração de Resposta</h3>
          <label className="toggle-switch">
            <input type="checkbox" checked={isAtivo} onChange={(e) => handleConfigChange(ativoKey, e.target.checked)} />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Nome da Resposta (Organização interna)</label>
            <input 
              type="text" 
              value={editingConfig[nomeKey] || ''} 
              onChange={(e) => handleConfigChange(nomeKey, e.target.value)}
              style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
              disabled={!isAtivo}
              placeholder="Nome da Resposta"
            />
          </div>
          <div>
            <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Gatilhos / Palavras-chave (separadas por vírgula)</label>
            <input 
              type="text" 
              value={editingConfig[gatilhosKey] || ''} 
              onChange={(e) => handleConfigChange(gatilhosKey, e.target.value)}
              style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
              disabled={!isAtivo}
            />
          </div>
        </div>

        <div>
          <label style={{display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)'}}>Resposta do Bot</label>
          <textarea 
            value={editingConfig[respostaKey] || ''} 
            onChange={(e) => handleConfigChange(respostaKey, e.target.value)}
            style={{width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical'}}
            disabled={!isAtivo}
          />
        </div>
      </div>
    );
  };

  if (status === 'shutdown_complete') {
    return (
      <div className="dashboard-container">
        <main className="main-content">
          <div className="card">
            <h2>Desconectado</h2>
            <p className="message">O robô foi desligado ou está reiniciando.<br/><br/>Uma nova janela se abrirá automaticamente caso ele esteja reiniciando. <b>Você já pode fechar esta aba!</b></p>
          </div>
        </main>
      </div>
    );
  }

  if (status === 'updating') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)', fontFamily: 'sans-serif' }}>
        <div className="card">
          <div className="loading-spinner"></div>
          <h2 style={{ color: 'var(--warning)', marginBottom: '1rem', marginTop: 0 }}>📥 Baixando Atualização...</h2>
          <p className="message" style={{ lineHeight: '1.6', marginBottom: '1.5rem' }}>
            O robô está baixando e aplicando a nova versão do executável. O chatbot fechará e reabrirá automaticamente em instantes. Por favor, aguarde e não feche esta janela.
          </p>
        </div>
      </div>
    );
  }

  if (isRestarting) {
    const getRestartingReasonText = () => {
      switch (restartingReason) {
        case 'health_check_failure':
          return 'O sistema detectou que o navegador do WhatsApp travou silenciosamente. O robô está reiniciando automaticamente para se recuperar.';
        case 'daily_maintenance':
          return 'Realizando a manutenção diária agendada (04:00 AM) para limpar a memória RAM e otimizar o sistema.';
        case 'manual_restore':
          return 'Limpando dados de conexão e reiniciando o sistema conforme solicitado.';
        default:
          return 'O robô está reiniciando de forma limpa para garantir a estabilidade do sistema.';
      }
    };

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)', fontFamily: 'sans-serif' }}>
        <div className="card">
          <div className="loading-spinner"></div>
          <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem', marginTop: 0 }}>🔄 Auto-Recuperação Ativa</h2>
          <p className="message" style={{ lineHeight: '1.6', marginBottom: '1.5rem' }}>
            {getRestartingReasonText()}
          </p>
          <p style={{ color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
            O PAINEL IRÁ RECONECTAR AUTOMATICAMENTE EM ALGUNS SEGUNDOS. POR FAVOR, NÃO FECHE ESTA ABA.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="header" style={{display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: '0.5rem'}}>
            <h1 style={{margin: 0}}>Zenith Chatbot</h1>
            <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8}}>v1.1.1</span>
          </div>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button 
              onClick={() => setActiveTab('dashboard')}
              style={{
                backgroundColor: activeTab === 'dashboard' ? 'var(--primary)' : 'transparent', 
                color: activeTab === 'dashboard' ? 'white' : 'var(--text-secondary)',
                border: activeTab === 'dashboard' ? 'none' : '1px solid var(--border)',
                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
              }}
            >
              📊 Painel
            </button>
            <button 
              onClick={() => setActiveTab('settings_menu')}
              style={{
                backgroundColor: activeTab === 'settings_menu' ? 'var(--primary)' : 'transparent', 
                color: activeTab === 'settings_menu' ? 'white' : 'var(--text-secondary)',
                border: activeTab === 'settings_menu' ? 'none' : '1px solid var(--border)',
                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
              }}
            >
              📝 Opções do Menu
            </button>
            <button 
              onClick={() => setActiveTab('settings_keywords')}
              style={{
                backgroundColor: activeTab === 'settings_keywords' ? 'var(--primary)' : 'transparent', 
                color: activeTab === 'settings_keywords' ? 'white' : 'var(--text-secondary)',
                border: activeTab === 'settings_keywords' ? 'none' : '1px solid var(--border)',
                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
              }}
            >
              🔑 Respostas Avulsas
            </button>
          </div>
        </div>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <div className={`status-badge ${status}`} style={{margin: 0}}>
            <div className="status-dot"></div>
            {getStatusText()}
          </div>
          {status === 'connected' && (
            <button 
              onClick={togglePause}
              style={{
                backgroundColor: isPaused ? 'var(--success)' : 'var(--warning)', 
                color: 'white', border: 'none', 
                padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
              }}
            >
              {isPaused ? '▶ Retomar Respostas' : '⏸ Pausar Bot'}
            </button>
          )}
          <button 
            onClick={handleRestartClean}
            style={{
              backgroundColor: 'var(--warning)', color: 'white', border: 'none', 
              padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', marginRight: '0.5rem'
            }}
            title="Use isso se o bot travar ou demorar muito para iniciar"
          >
            🔄 Restaurar Conexão
          </button>
          <button 
            onClick={handleShutdown}
            style={{
              backgroundColor: 'var(--danger)', color: 'white', border: 'none', 
              padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            Desligar Bot
          </button>
        </div>
      </header>
      
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div className="card">
            {status === 'connected' ? (
              <div>
                <div className={`status-badge ${isPaused ? 'qr_ready' : 'connected'}`} style={{ marginBottom: '1rem' }}>
                  <div className="status-dot"></div>
                  {isPaused ? 'Bot Pausado' : 'Bot Ativo e Operando'}
                </div>
                <p className="message">
                  {isPaused 
                    ? 'O chatbot está pausado e não responderá a novas mensagens até ser retomado.' 
                    : 'O chatbot está conectado e pronto para responder às mensagens dos seus clientes.'}
                </p>
                {updateInfo && updateInfo.available && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid var(--warning)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '1.5rem',
                    textAlign: 'left'
                  }}>
                    <div style={{ flex: 1, marginRight: '1rem' }}>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
                        🚀 Nova Atualização Disponível (v{updateInfo.version})
                      </strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Novidades: {updateInfo.changelog}
                      </span>
                    </div>
                    <button
                      onClick={handleTriggerUpdate}
                      style={{
                        backgroundColor: 'var(--warning)',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Atualizar Agora
                    </button>
                  </div>
                )}
                {recoveryStatus && recoveryStatus.lastRestartReason && (
                  <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    backgroundColor: 'rgba(139, 92, 246, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    borderRadius: '0.5rem',
                    textAlign: 'left'
                  }}>
                    <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      ⚙️ Histórico do Sistema
                    </strong>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      Último reinício automático de auto-recuperação:{' '}
                      <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                        {new Date(recoveryStatus.lastRestartTime).toLocaleString('pt-BR')}
                      </span>
                      {' '} - Motivo:{' '}
                      <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
                        {recoveryStatus.lastRestartReason === 'health_check_failure' ? 'Navegador congelado (Recuperação Automática)' :
                         recoveryStatus.lastRestartReason === 'daily_maintenance' ? 'Manutenção diária agendada' :
                         recoveryStatus.lastRestartReason === 'manual_restore' ? 'Restauração de conexão manual' :
                         recoveryStatus.lastRestartReason === 'whatsapp_disconnection' ? 'Desconexão do WhatsApp' :
                         recoveryStatus.lastRestartReason}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ) : status === 'qr_ready' && qrCode ? (
              <div>
                <h2 style={{marginTop: 0}}>Conecte seu WhatsApp</h2>
                <p className="message" style={{marginBottom: '2rem'}}>Abra o WhatsApp no seu celular, vá em "Aparelhos Conectados" e escaneie o código abaixo.</p>
                <div className="qr-container">
                  <QRCodeSVG value={qrCode} size={256} />
                </div>
              </div>
            ) : (
              <div>
                <div className="loading-spinner"></div>
                <h2>Iniciando Sistema</h2>
                <p className="message">Aguarde enquanto o chatbot é inicializado e o sistema verifica a conexão...</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings_menu' && (
          <div className="card" style={{maxWidth: '800px', width: '100%', margin: '0 auto'}}>
            <h2 style={{marginTop: 0, marginBottom: '1rem'}}>Opções Numéricas do Menu</h2>
            <p className="message" style={{marginBottom: '2rem'}}>Edite o nome da opção (só pra sua organização), os gatilhos que acionam a resposta (além do número) e o texto final.</p>
            
            {editingConfig && (
              <div style={{display: 'flex', flexDirection: 'column'}}>
                <div style={{marginBottom: '2rem'}}>
                  <label style={{display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)'}}>Menu Principal (Mensagem de Boas-vindas)</label>
                  <textarea 
                    value={editingConfig.menu_principal || ''} 
                    onChange={(e) => handleConfigChange('menu_principal', e.target.value)}
                    style={{width: '100%', minHeight: '200px', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical'}}
                  />
                </div>
                
                {renderOption(1)}
                {renderOption(2)}
                {renderOption(3)}
                {renderOption(4)}
                {renderOption(5)}
                {renderOption(6)}
                {renderOption(7)}
                {renderOption(8)}
                {renderOption(9)}

                <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', position: 'sticky', bottom: '1rem'}}>
                  <button 
                    onClick={handleSaveConfig}
                    style={{
                      backgroundColor: 'var(--primary)', color: 'white', border: 'none', 
                      padding: '0.75rem 2rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold',
                      fontSize: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    💾 Salvar Alterações
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings_keywords' && (
          <div className="card" style={{maxWidth: '800px', width: '100%', margin: '0 auto'}}>
            <h2 style={{marginTop: 0, marginBottom: '1rem'}}>Respostas Avulsas (Palavras-chave)</h2>
            <p className="message" style={{marginBottom: '2rem'}}>Essas respostas são enviadas caso o cliente digite qualquer uma das palavras-chave abaixo durante a conversa.</p>
            
            {editingConfig && (
              <div style={{display: 'flex', flexDirection: 'column'}}>
                {renderAvulso('passaporte')}
                {renderAvulso('eta')}
                {renderAvulso('mexico')}
                {renderAvulso('eua')}
                {renderAvulso('menor')}
                {renderAvulso('seguro')}
                {renderAvulso('vacina')}
                {renderAvulso('doc')}
                {renderAvulso('pix')}
                {renderAvulso('visto')}
                {renderAvulso('boleto')}

                {/* RESPOSTAS CUSTOMIZADAS */}
                {(editingConfig.respostas_customizadas || []).map((resp, index) => (
                  <div key={resp.id || index} style={{padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', opacity: resp.ativo ? 1 : 0.6}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                      <h3 style={{margin: 0, color: 'var(--text-primary)'}}>Nova Resposta Avulsa</h3>
                      <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
                        <button 
                          onClick={() => removeCustomResponse(index)}
                          style={{background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', fontSize: '1.2rem'}}
                          title="Excluir Resposta"
                        >
                          🗑️
                        </button>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={resp.ativo} onChange={(e) => handleCustomResponseChange(index, 'ativo', e.target.checked)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                    
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
                      <div>
                        <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Nome da Resposta (Organização interna)</label>
                        <input 
                          type="text" 
                          value={resp.nome || ''} 
                          onChange={(e) => handleCustomResponseChange(index, 'nome', e.target.value)}
                          style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
                          disabled={!resp.ativo}
                          placeholder="Nome da Resposta"
                        />
                      </div>
                      <div>
                        <label style={{display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)'}}>Gatilhos / Palavras-chave (separadas por vírgula)</label>
                        <input 
                          type="text" 
                          value={resp.gatilhos || ''} 
                          onChange={(e) => handleCustomResponseChange(index, 'gatilhos', e.target.value)}
                          style={{width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)'}}
                          disabled={!resp.ativo}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)'}}>Resposta do Bot</label>
                      <textarea 
                        value={resp.resposta || ''} 
                        onChange={(e) => handleCustomResponseChange(index, 'resposta', e.target.value)}
                        style={{width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical'}}
                        disabled={!resp.ativo}
                      />
                    </div>
                  </div>
                ))}

                <div style={{display: 'flex', justifyContent: 'center', marginBottom: '2rem'}}>
                  <button 
                    onClick={addCustomResponse}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px dashed var(--border)', 
                      padding: '1rem 2rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold',
                      fontSize: '1rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem'
                    }}
                  >
                    ➕ Adicionar Nova Resposta Avulsa
                  </button>
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', position: 'sticky', bottom: '1rem'}}>
                  <button 
                    onClick={handleSaveConfig}
                    style={{
                      backgroundColor: 'var(--primary)', color: 'white', border: 'none', 
                      padding: '0.75rem 2rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold',
                      fontSize: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    💾 Salvar Alterações
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
