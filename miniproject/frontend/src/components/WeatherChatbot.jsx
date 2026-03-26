import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, CloudSun } from 'lucide-react';
import './WeatherChatbot.css';

const SUGGESTIONS = [
    'Current weather',
    'Temperature',
    'Will it rain?',
    'Forecast',
    "Yesterday's weather",
    'What is UV index?',
];

const WELCOME_MESSAGE = {
    role: 'bot',
    text: "Hi! I'm your weather assistant 🌤️\n\nAsk me about current conditions, forecasts, past weather, or anything weather-related!",
};

// Parse **bold** markdown in text
function renderMessageText(text) {
    // Split by newlines first
    const lines = text.split('\n');
    return lines.map((line, i) => {
        // Split by **bold** markers
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <span key={j} className="msg-bold">
                        {part.slice(2, -2)}
                    </span>
                );
            }
            return part;
        });
        return (
            <span key={i} className="msg-line">
                {rendered}
            </span>
        );
    });
}

export function WeatherChatbot({ setCurrentPage }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [messages, setMessages] = useState([WELCOME_MESSAGE]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 350);
        }
    }, [isOpen]);

    const handleToggle = () => {
        if (isOpen) {
            setIsClosing(true);
            setTimeout(() => {
                setIsOpen(false);
                setIsClosing(false);
            }, 250);
        } else {
            setIsOpen(true);
        }
    };

    const sendMessage = async (text) => {
        const trimmed = (text || input).trim();
        if (!trimmed || isLoading) return;

        // Add user message
        setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
        setInput('');
        setIsLoading(true);
        setShowSuggestions(false);

        try {
            // Send the new message AND the history (excluding the welcome message and this new unsaved message)
            const chatHistory = messages
                .filter(msg => msg !== WELCOME_MESSAGE)
                .map(msg => {
                    let textToSend = msg.text;
                    if (msg.role === 'bot') {
                        // Strip out hidden tags from historical messages so the bot doesn't copy them
                        textToSend = textToSend.replace(/\[REDIRECT:[a-z]+\]/g, '').trim();
                        textToSend = textToSend.replace(/\[DOWNLOAD:\d+\]/g, '').trim();
                        // Strip out the extra downloading text we artificially add to the UI
                        textToSend = textToSend.replace(/\n\n\*Downloading data for the past \d+ days\.\.\.\*/g, '').trim();
                    }
                    return { role: msg.role, text: textToSend };
                });

            const response = await fetch('http://localhost:3000/api/weather/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: trimmed,
                    history: chatHistory
                }),
            });

            const data = await response.json();
            const aiResponseText = data.reply || 'Weather data is currently unavailable.';

            // Check for navigation trigger (e.g. [REDIRECT:analysis])
            let messageText = aiResponseText;
            const redirectMatch = aiResponseText.match(/\[REDIRECT:([a-z]+)\]/);
            const downloadMatch = aiResponseText.match(/\[DOWNLOAD:(\d+)\]/);

            if (redirectMatch && redirectMatch[1] && setCurrentPage) {
                // Remove the hidden tag from the displayed text
                messageText = aiResponseText.replace(/\[REDIRECT:[a-z]+\]/g, '').trim();

                // Add message, then navigate after a brief delay so the user sees the message
                setMessages((prev) => [
                    ...prev,
                    { role: 'bot', text: messageText },
                ]);

                setTimeout(() => {
                    setCurrentPage(redirectMatch[1]);
                    // Auto-close chat when navigating away
                    setIsOpen(false);
                }, 1500);
            } else if (downloadMatch && downloadMatch[1]) {
                const days = downloadMatch[1];
                messageText = aiResponseText.replace(/\[DOWNLOAD:\d+\]/g, '').trim();

                // Add message reflecting the download is starting
                setMessages((prev) => [
                    ...prev,
                    { role: 'bot', text: messageText + `\n\n*Downloading data for the past ${days} days...*` },
                ]);

                // Trigger file download programmatically via anchor tag
                const downloadUrl = `http://localhost:3000/api/weather/export?days=${days}`;
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `weather_export_${days}_days.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

            } else {
                setMessages((prev) => [
                    ...prev,
                    { role: 'bot', text: messageText },
                ]);
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'bot',
                    text: 'Sorry, I could not connect to the weather server. Please make sure the backend is running.',
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Floating toggle button */}
            <button
                id="chatbot-toggle"
                className={`chatbot-toggle ${isOpen ? 'open' : ''}`}
                onClick={handleToggle}
                aria-label={isOpen ? 'Close chat' : 'Open weather chat'}
            >
                {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
            </button>

            {/* Chat window */}
            {isOpen && (
                <div className={`chatbot-window ${isClosing ? 'closing' : ''}`}>
                    {/* Header */}
                    <div className="chatbot-header">
                        <div className="chatbot-header-info">
                            <div className="chatbot-header-icon">
                                <CloudSun size={18} />
                            </div>
                            <div className="chatbot-header-text">
                                <h3>Weather Assistant</h3>
                                <p>
                                    <span className="chatbot-status-dot"></span>
                                    Online • Ask me anything
                                </p>
                            </div>
                        </div>
                        <button className="chatbot-close-btn" onClick={handleToggle} aria-label="Close chat">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`chatbot-message ${msg.role}`}>
                                {renderMessageText(msg.text)}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="chatbot-typing">
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestions */}
                    {showSuggestions && messages.length <= 1 && (
                        <div className="chatbot-suggestions">
                            {SUGGESTIONS.map((s, i) => (
                                <button key={i} className="chatbot-suggestion" onClick={() => sendMessage(s)}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input area */}
                    <div className="chatbot-input-area">
                        <input
                            ref={inputRef}
                            id="chatbot-input"
                            className="chatbot-input"
                            type="text"
                            placeholder="Ask about weather..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            autoComplete="off"
                        />
                        <button
                            id="chatbot-send"
                            className="chatbot-send-btn"
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading}
                            aria-label="Send message"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
