import React, { useState, useRef, useEffect } from "react";
import api from "../services/api";
import { MessageSquare, X, Send, Loader2, Mic, MicOff, Volume2, VolumeX, Sparkles } from "lucide-react";
import { useConfig } from "../context/ConfigContext";

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const Chatbot = ({ usuarioLogado }) => {
  const { config } = useConfig();
  const primeiroNome = usuarioLogado?.nome?.split(" ")[0] || "";
  const curso = usuarioLogado?.curso || "";

  const saudacaoInicial = primeiroNome
    ? `Olá, ${primeiroNome}! Sou o assistente académico da ${config.nome_plataforma}.${curso ? ` Estou preparado para te ajudar com ${curso} e qualquer outra matéria.` : ""} Faz-me uma pergunta sobre um conceito, exercício ou tema de estudo.`
    : `Olá! Sou o assistente académico da ${config.nome_plataforma}. Posso explicar conceitos, ajudar em exercícios ou preparar-te para exames. O que queres estudar?`;

  const [chatOpen, setChatOpen]     = useState(false);
  const [chatInput, setChatInput]   = useState("");
  const [isTyping, setIsTyping]     = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { sender: "bot", text: saudacaoInicial },
  ]);

  const recognitionRef  = useRef(null);
  const messagesEndRef  = useRef(null);
  // Mantém sempre a versão mais recente — o recognition é criado uma única vez
  // ao montar, por isso o seu onresult não pode fechar sobre estado desactualizado
  // (ex.: voiceEnabled), ou a resposta por voz nunca reflectiria o botão de voz.
  const sendMessageWithTextRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!SpeechRecognitionAPI) return;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "pt-PT";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(transcript);
      setIsListening(false);
      setTimeout(() => sendMessageWithTextRef.current?.(transcript), 100);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend   = () => setIsListening(false);
    recognitionRef.current = recognition;
    return () => { recognition.abort(); };
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognitionAPI) return;
    if (isListening) { recognitionRef.current?.abort(); setIsListening(false); }
    else { setChatInput(""); recognitionRef.current?.start(); setIsListening(true); }
  };

  const speakText = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-PT";
    utterance.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith("pt"));
    if (ptVoice) utterance.voice = ptVoice;
    window.speechSynthesis.speak(utterance);
  };

  const sendMessageWithText = async (text) => {
    const msg = text.trim();
    if (!msg) return;
    setChatMessages(prev => [...prev, { sender: "user", text: msg }]);
    setChatInput("");
    setIsTyping(true);
    try {
      const res = await api.post("/chat", { mensagem: msg });
      const botText = res.data.resposta;
      setChatMessages(prev => [...prev, { sender: "bot", text: botText }]);
      speakText(botText);
    } catch {
      setChatMessages(prev => [...prev, { sender: "bot", text: "Não consegui obter resposta neste momento. Verifica a ligação ou tenta de novo em alguns segundos." }]);
    } finally {
      setIsTyping(false);
    }
  };
  sendMessageWithTextRef.current = sendMessageWithText;

  const handleSend = () => sendMessageWithText(chatInput);

  return (
    <div className="fixed bottom-7 right-7 z-50">
      <style>{`
        @keyframes fab-glow {
          0%,100% { box-shadow: 0 8px 36px rgba(var(--color-navy-deep-rgb),0.50), 0 0 0 0 rgba(var(--color-gold-rgb),0); }
          50%      { box-shadow: 0 12px 48px rgba(var(--color-navy-deep-rgb),0.60), 0 0 0 8px rgba(var(--color-gold-rgb),0.08); }
        }
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes aurora-chat-w {
          0%,100% { background-position: 0%   50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes dot-bounce {
          0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
          40%         { transform: scale(1.0); opacity: 1.0; }
        }
      `}</style>

      {/* ─── Janela de chat ─── */}
      {chatOpen && (
        <div
          className="w-[385px] h-[550px] mb-5 flex flex-col overflow-hidden"
          style={{
            borderRadius: 28,
            background: "#fff",
            border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)",
            boxShadow: "0 28px 90px rgba(var(--color-navy-deep-rgb),0.35), 0 6px 24px rgba(var(--color-navy-deep-rgb),0.12)",
            animation: "chat-slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Barra dourada topo */}
          <div style={{
            height: 3, flexShrink: 0,
            background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)",
            opacity: 0.90,
          }} />

          {/* Header do chat */}
          <div
            className="px-5 py-4 flex items-center justify-between shrink-0"
            style={{
              background: "linear-gradient(-45deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy))",
              backgroundSize: "300% 300%",
              animation: "aurora-chat-w 8s ease infinite",
            }}
          >
            <div className="flex items-center gap-3">
              {/* Ícone com glow */}
              <div
                className="w-11 h-11 rounded-[16px] grid place-items-center"
                style={{
                  background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))",
                  color: "var(--color-navy-deep)",
                  boxShadow: "0 6px 20px rgba(var(--color-gold-rgb),0.50)",
                }}
              >
                <Sparkles size={20} />
              </div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", display: "block", lineHeight: 1.2 }}>
                  Assistente IA
                </span>
                <span
                  className="flex items-center gap-1.5"
                  style={{ fontSize: 9, fontWeight: 700, color: "rgba(var(--color-blue-sky-rgb),0.55)", textTransform: "uppercase", letterSpacing: "0.4em" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.90)" }}
                  />
                  Online
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Botão de voz */}
              <button
                onClick={() => { if (voiceEnabled) window.speechSynthesis?.cancel(); setVoiceEnabled(v => !v); }}
                title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
                className="w-9 h-9 rounded-xl grid place-items-center transition-all duration-200"
                style={voiceEnabled
                  ? { background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 0 14px rgba(var(--color-gold-rgb),0.55)" }
                  : { background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)" }
                }
              >
                {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>

              {/* Fechar */}
              <button
                onClick={() => setChatOpen(false)}
                className="w-9 h-9 rounded-xl grid place-items-center transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)", e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div
            className="flex-1 px-5 py-4 overflow-y-auto flex flex-col gap-4"
            style={{ background: "#f8faff" }}
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className="flex"
                style={{ justifyContent: msg.sender === "bot" ? "flex-start" : "flex-end" }}
              >
                {msg.sender === "bot" && (
                  <div
                    className="w-7 h-7 rounded-xl grid place-items-center text-xs shrink-0 mr-2.5 self-end"
                    style={{
                      background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))",
                      color: "var(--color-navy-deep)",
                      fontWeight: 900,
                      boxShadow: "0 3px 10px rgba(var(--color-gold-rgb),0.40)",
                    }}
                  >
                    ✦
                  </div>
                )}
                <div
                  className="max-w-[82%] px-4 py-3 rounded-2xl text-sm"
                  style={msg.sender === "bot"
                    ? {
                        background: "#fff",
                        border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)",
                        color: "#334155",
                        borderBottomLeftRadius: 6,
                        boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)",
                        lineHeight: 1.6,
                      }
                    : {
                        background: "linear-gradient(135deg, var(--color-navy-deep), var(--color-navy-mid))",
                        color: "#fff",
                        borderBottomRightRadius: 6,
                        boxShadow: "0 6px 20px rgba(var(--color-navy-deep-rgb),0.30)",
                        lineHeight: 1.6,
                      }
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Indicador de digitação */}
            {isTyping && (
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-xl grid place-items-center text-xs shrink-0"
                  style={{
                    background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))",
                    color: "var(--color-navy-deep)",
                    fontWeight: 900,
                    boxShadow: "0 3px 10px rgba(var(--color-gold-rgb),0.40)",
                  }}
                >
                  ✦
                </div>
                <div
                  className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
                  style={{ background: "#fff", border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)", borderBottomLeftRadius: 6 }}
                >
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: "#94a3b8",
                        animation: `dot-bounce 1.4s ${i * 0.2}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Indicador de escuta */}
          {isListening && (
            <div
              className="mx-5 mb-2 flex items-center gap-2 rounded-xl px-4 py-2.5 animate-pulse"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.22)",
                color: "#dc2626",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} />
              A ouvir... fale agora
            </div>
          )}

          {/* Input */}
          <div
            className="p-3.5 flex gap-2 shrink-0"
            style={{ borderTop: "1px solid rgba(var(--color-navy-mid-rgb),0.07)", background: "#fff" }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder={isListening ? "A ouvir..." : "Pergunta algo..."}
              disabled={isTyping || isListening}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--color-ice)",
                border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.09)",
                color: "#0f172a",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--color-navy-mid)", e.target.style.background = "#fff")}
              onBlur={e => (e.target.style.borderColor = "rgba(var(--color-navy-mid-rgb),0.09)", e.target.style.background = "var(--color-ice)")}
            />

            {/* Microfone */}
            {SpeechRecognitionAPI && (
              <button
                onClick={toggleListening}
                disabled={isTyping}
                className="p-2.5 rounded-xl transition-all duration-200 shrink-0"
                style={isListening
                  ? {
                      background: "#ef4444", color: "#fff",
                      boxShadow: "0 4px 16px rgba(239,68,68,0.45)",
                      animation: "pulse 1s ease-in-out infinite",
                    }
                  : {
                      background: "var(--color-ice)",
                      border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.09)",
                      color: "#64748b",
                    }
                }
              >
                {isListening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            )}

            {/* Enviar */}
            <button
              onClick={handleSend}
              disabled={isTyping || isListening}
              className="p-2.5 rounded-xl transition-all duration-200 shrink-0 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))",
                color: "var(--color-navy-deep)",
                boxShadow: "0 4px 16px rgba(var(--color-gold-rgb),0.45)",
              }}
              onMouseEnter={e => !isTyping && !isListening && (e.currentTarget.style.transform = "scale(1.08)", e.currentTarget.style.boxShadow = "0 6px 22px rgba(var(--color-gold-rgb),0.65)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 4px 16px rgba(var(--color-gold-rgb),0.45)")}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ─── FAB principal ─── */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="relative w-16 h-16 rounded-[22px] flex items-center justify-center transition-all duration-300"
        style={{
          background: chatOpen
            ? "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))"
            : "linear-gradient(135deg, var(--color-navy-deep), var(--color-navy-mid))",
          color: chatOpen ? "var(--color-navy-deep)" : "#fff",
          border: "4px solid rgba(255,255,255,0.95)",
          animation: "fab-glow 3s ease-in-out infinite",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.10)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1.00)")}
      >
        {/* Indicador online */}
        {!chatOpen && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-white animate-pulse"
            style={{
              background: "#34d399",
              boxShadow: "0 0 10px rgba(52,211,153,0.85)",
            }}
          />
        )}
        <MessageSquare size={28} />
      </button>
    </div>
  );
};

export default Chatbot;
