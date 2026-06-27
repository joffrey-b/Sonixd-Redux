import React from 'react';
import { Notification, toaster } from 'rsuite';

// rsuite 6: Notification is a React component; static methods (Notification.info etc.)
// were removed. Use toaster.push(<Notification />, { duration }) instead.
export const notifyToast = (
  type: 'info' | 'success' | 'warning' | 'error',
  message: unknown,
  description?: unknown
) => {
  const safeMsg =
    message instanceof Error
      ? message.message
      : typeof message === 'string'
        ? message
        : String(message);
  const duration = type === 'info' ? 2000 : type === 'success' ? 2500 : 3000;
  // When called with only a message, use the type label as the header and put
  // the full message text in the body so long strings wrap rather than truncate.
  // When a description is provided, the caller already split title vs. detail.
  const header = description !== undefined ? safeMsg : type.charAt(0).toUpperCase() + type.slice(1);
  const body = description !== undefined ? description : safeMsg;
  toaster.push(
    React.createElement(Notification, { type, header, closable: true }, body as React.ReactNode),
    {
      duration,
    }
  );
};
