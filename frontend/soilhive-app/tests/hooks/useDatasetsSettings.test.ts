import { renderHook, act } from '@testing-library/react';
import { useDatasetsSettings } from 'hooks/useDatasetsSettings';
import { ADMIN_PATHS } from '../../src/configuration/admin';

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

describe('useDatasetsSettings', () => {
  afterEach(() => jest.clearAllMocks());

  it('initialises with public visibility and empty state', () => {
    const { result } = renderHook(() => useDatasetsSettings());
    expect(result.current.visibility).toBe('public');
    expect(result.current.emailInput).toBe('');
    expect(result.current.accessEmails).toEqual([]);
    expect(result.current.emailToDelete).toBeNull();
    expect(result.current.isPublishWarningVisible).toBe(false);
  });

  describe('handleEmailChange', () => {
    it('updates emailInput value', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('test@example.com'));
      expect(result.current.emailInput).toBe('test@example.com');
    });

    it('clears an existing emailError', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => {
        result.current.handleEmailChange('not-valid');
        result.current.handleEmailBlur();
        result.current.handleEmailChange('anything');
      });
      expect(result.current.emailError).toBe('');
    });
  });

  describe('handleEmailBlur', () => {
    it('sets error when input contains an invalid email', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('not-an-email'));
      act(() => result.current.handleEmailBlur());
      expect(result.current.emailError).toBeTruthy();
    });

    it('does not set error when input is blank', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailBlur());
      expect(result.current.emailError).toBe('');
    });
  });

  describe('handleAddEmail', () => {
    it('appends a valid email and clears the input', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toEqual([{ email: 'user@example.com' }]);
      expect(result.current.emailInput).toBe('');
    });

    it('sets error and does not add an invalid email', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('bad-email'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toHaveLength(0);
      expect(result.current.emailError).toBeTruthy();
    });

    it('does not add a duplicate email', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toHaveLength(1);
    });

    it('sets error when a duplicate email is added', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.emailError).toBeTruthy();
    });
  });

  describe('handleRequestRemoveEmail', () => {
    it('sets emailToDelete to the given address', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      expect(result.current.emailToDelete).toBe('user@example.com');
    });
  });

  describe('handleConfirmRemoveEmail', () => {
    it('removes the email from the list and clears emailToDelete', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      act(() => result.current.handleConfirmRemoveEmail());
      expect(result.current.accessEmails).toEqual([]);
      expect(result.current.emailToDelete).toBeNull();
    });

    it('does not affect other emails in the list', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('a@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('b@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('a@example.com'));
      act(() => result.current.handleConfirmRemoveEmail());
      expect(result.current.accessEmails).toEqual([{ email: 'b@example.com' }]);
    });
  });

  describe('handleCancelRemoveEmail', () => {
    it('clears emailToDelete without removing the email', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      act(() => result.current.handleCancelRemoveEmail());
      expect(result.current.emailToDelete).toBeNull();
      expect(result.current.accessEmails).toHaveLength(1);
    });
  });

  describe('handlePublish', () => {
    it('opens the publish warning dialog', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });
  });

  describe('handlePublishProceed', () => {
    it('closes the publish warning dialog', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handlePublish());
      act(() => result.current.handlePublishProceed());
      expect(result.current.isPublishWarningVisible).toBe(false);
    });
  });

  describe('handlePublishCancel', () => {
    it('closes the publish warning dialog', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handlePublish());
      act(() => result.current.handlePublishCancel());
      expect(result.current.isPublishWarningVisible).toBe(false);
    });
  });

  describe('handleCancel', () => {
    it('navigates to the datasets list', () => {
      const { result } = renderHook(() => useDatasetsSettings());
      act(() => result.current.handleCancel());
      expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });
  });
});
