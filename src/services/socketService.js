let io = null;

const SocketService = {
  init(socketIO) {
    io = socketIO;
  },

  getIO() {
    return io;
  },

  emitNewMessage(message, conversation) {
    if (io) {
      io.emit('new_message', { message, conversation });
    }
  },

  emitMessageStatus(messageId, status) {
    if (io) {
      io.emit('message_status', { messageId, status });
    }
  },

  emitConversationUpdate(conversationId, data) {
    if (io) {
      io.emit('conversation_update', { conversationId, ...data });
    }
  },

  emitContactUpdate(contact) {
    if (io) {
      io.emit('contact_updated', { contact });
    }
  }
};

module.exports = SocketService;
