import { renderHook, act } from '@testing-library/react';
import { useFilterForm } from 'hooks/useFilterForm';

describe('useFilterForm', () => {
  it('starts with an empty, invalid form', () => {
    const { result } = renderHook(() => useFilterForm());

    expect(result.current.formData).toEqual({ name: '', description: '' });
    expect(result.current.isFormValid).toBe(false);
  });

  it('updates one field at a time', () => {
    const { result } = renderHook(() => useFilterForm());

    act(() => result.current.handleChange('name', 'Land Cover'));

    expect(result.current.formData).toEqual({ name: 'Land Cover', description: '' });
  });

  it('is valid once both the name and the description are filled', () => {
    const { result } = renderHook(() => useFilterForm());

    act(() => result.current.handleChange('name', 'Land Cover'));
    expect(result.current.isFormValid).toBe(false);

    act(() => result.current.handleChange('description', 'Copernicus land cover'));
    expect(result.current.isFormValid).toBe(true);
  });

  it('treats whitespace-only fields as empty', () => {
    const { result } = renderHook(() => useFilterForm());

    act(() => {
      result.current.handleChange('name', '   ');
      result.current.handleChange('description', 'Copernicus land cover');
    });

    expect(result.current.isFormValid).toBe(false);
  });

  it('returns the trimmed form data', () => {
    const { result } = renderHook(() => useFilterForm());

    act(() => {
      result.current.handleChange('name', '  Land Cover ');
      result.current.handleChange('description', ' Copernicus land cover  ');
    });

    expect(result.current.trimmedFormData()).toEqual({ name: 'Land Cover', description: 'Copernicus land cover' });
  });

  it('replaces the whole form with setFormData', () => {
    const { result } = renderHook(() => useFilterForm());

    act(() => result.current.setFormData({ name: 'Soil Groups', description: 'HWSD v2.0' }));

    expect(result.current.formData).toEqual({ name: 'Soil Groups', description: 'HWSD v2.0' });
  });
});
