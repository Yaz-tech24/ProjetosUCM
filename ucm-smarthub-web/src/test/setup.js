import "@testing-library/jest-dom/vitest";

// jsdom não implementa scrollIntoView — vários componentes chamam-no ao
// receber novas mensagens/itens (ex: Chat.jsx, Chatbot.jsx); sem isto,
// qualquer teste que monte esses componentes rebenta com um TypeError.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
