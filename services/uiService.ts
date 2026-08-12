export type UiNoticeType = 'success' | 'error' | 'info' | 'warning';

export interface UiConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  dangerous?: boolean;
}

export interface UiPromptOptions extends UiConfirmOptions {
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
}

export const UI_NOTIFY_EVENT = 'penaltypro:ui-notify';
export const UI_CONFIRM_EVENT = 'penaltypro:ui-confirm';
export const UI_PROMPT_EVENT = 'penaltypro:ui-prompt';

export const notifyUser = (
  title: string,
  message = '',
  type: UiNoticeType = 'info',
): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UI_NOTIFY_EVENT, {
    detail: { title, message, type },
  }));
};

export const confirmAction = (
  message: string,
  options: UiConfirmOptions = {},
): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(UI_CONFIRM_EVENT, {
      detail: { message, options, resolve },
    }));
  });
};

export const promptAction = (
  message: string,
  options: UiPromptOptions = {},
): Promise<string | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(UI_PROMPT_EVENT, {
      detail: { message, options, resolve },
    }));
  });
};
