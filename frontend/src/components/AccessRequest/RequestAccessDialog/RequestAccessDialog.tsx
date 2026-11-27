import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Dialog } from 'components/Dialog/Dialog';
import { Dropdown, FormMessage, TextArea, TextInput } from 'components/UI';
import { PRIVACY_POLICY_ROUTE } from 'configuration/routes';
import { withBasePath } from 'configuration/basePath';
import type { CountryCode } from 'configuration/countries';
import useTheme from 'hooks/useTheme';
import { countryOptionsOf } from 'utilities/countryOptions';
import { useAuthContext } from '../../../auth/AuthContextProvider';

import styles from './RequestAccessDialog.module.scss';

export const REQUEST_REASON_MAX_LENGTH = 180;
// What the backend takes (backend/src/access-requests.yaml)
export const REQUEST_FIELD_MAX_LENGTHS = { name: 200, organisation: 200, organisationWebsite: 2048 } as const;
type LimitedField = keyof typeof REQUEST_FIELD_MAX_LENGTHS;

// The backend's own check of the organisation website: an http(s) address with a dotted host, where
// a bare domain gets https://. Blank is fine, as the field is optional.
export const isWebsiteAddress = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.');
  } catch {
    return false;
  }
};

export interface RequestAccessFormValues {
  name: string;
  email: string;
  // Empty until one is picked
  country: CountryCode | '';
  organisation: string;
  organisationWebsite: string;
  reason: string;
}

// The email is not among them: it is only shown, never typed (see below)
type RequiredField = Exclude<keyof RequestAccessFormValues, 'email' | 'organisationWebsite'>;
const REQUIRED_FIELDS: RequiredField[] = ['name', 'country', 'organisation', 'reason'];

const maxLengthOf = (name: keyof RequestAccessFormValues): number | undefined =>
  name in REQUEST_FIELD_MAX_LENGTHS ? REQUEST_FIELD_MAX_LENGTHS[name as LimitedField] : undefined;
const isTooLong = (name: keyof RequestAccessFormValues, value: string) => value.length > (maxLengthOf(name) ?? Infinity);

interface Props {
  datasetName: string;
  // While the user's own requests are read: nothing can be sent yet
  isLoading?: boolean;
  // While the request is being sent: it can't be sent again
  isSubmitting?: boolean;
  // Why the backend refused the last request. In the form, not in a toast, which the dialog would cover.
  sendError?: string;
  onClose: () => void;
  onSubmit: (values: RequestAccessFormValues) => void;
}

// The request access form of the dashboards plugin (SP-5988), for one Dataset
export function RequestAccessDialog({ datasetName, isLoading = false, isSubmitting = false, sendError, onClose, onSubmit }: Props) {
  const { t, i18n } = useTranslation('availability');
  const sendErrorRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthContext();
  const { themeConfig } = useTheme();
  const countryOptions = useMemo(() => countryOptionsOf(i18n.resolvedLanguage ?? 'en'), [i18n.resolvedLanguage]);
  // The name and the email come from the signed-in user's profile and can't be changed here. A name
  // the profile lacks stays empty for the user to type, and one too long to send stays open for the
  // user to shorten. The email is never typed: the backend keys the request by the email of the
  // sign-in, so without one the field stays empty and the backend refuses the request
  // (email_required), which the form then says.
  const [prefilled] = useState<Pick<RequestAccessFormValues, 'name' | 'email'>>(() => ({
    name: user?.profile?.name?.trim() ?? '',
    email: user?.profile?.email?.trim() ?? '',
  }));
  const [values, setValues] = useState<RequestAccessFormValues>(() => ({
    ...prefilled,
    country: '',
    organisation: '',
    organisationWebsite: '',
    reason: '',
  }));

  const onFieldChange = useCallback((value: string, name?: string) => {
    setValues(previous => ({ ...previous, [name as keyof RequestAccessFormValues]: value }));
  }, []);

  const isComplete =
    REQUIRED_FIELDS.every(field => values[field].trim() !== '') &&
    (Object.keys(REQUEST_FIELD_MAX_LENGTHS) as LimitedField[]).every(field => !isTooLong(field, values[field])) &&
    isWebsiteAddress(values.organisationWebsite);

  const field = (name: keyof RequestAccessFormValues) => ({
    name,
    label: t(`access_request.form.fields.${name}`),
    value: values[name],
    isRequired: name === 'email' ? prefilled.email !== '' : REQUIRED_FIELDS.includes(name as RequiredField),
    isDisabled: name === 'email' || (name === 'name' && prefilled.name !== '' && !isTooLong(name, prefilled.name)),
    onChange: onFieldChange,
  });

  // Text the backend would refuse, typed or from the profile, says why the form can't be sent
  const errorOf = (name: keyof RequestAccessFormValues): string | undefined => {
    if (isTooLong(name, values[name])) {
      return t('access_request.form.too_long', { max: maxLengthOf(name) });
    }
    if (name === 'organisationWebsite' && !isWebsiteAddress(values[name])) {
      return t('access_request.form.invalid_website');
    }
    return undefined;
  };

  // The form scrolls inside the dialog, and the user may be anywhere in it when they send
  useEffect(() => {
    if (sendError) sendErrorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [sendError]);

  const textInput = (name: keyof RequestAccessFormValues) => {
    const errorMessage = errorOf(name);
    return { ...field(name), isError: errorMessage !== undefined, errorMessage };
  };

  return (
    <Dialog
      visible
      header={t('access_request.form.title')}
      className={styles.RequestAccessDialog}
      contentClassName={styles.Content}
      secondaryText={t('access_request.form.cancel')}
      primaryText={t('access_request.form.submit')}
      isLoading={isLoading || isSubmitting}
      isPrimaryDisabled={!isComplete}
      // The first field it would focus is the country, whose list would open over the form
      focusOnShow={false}
      onPrimary={() => onSubmit(values)}
      onSecondary={onClose}
      onClose={onClose}
    >
      <p className={styles.Text}>
        <Trans t={t} i18nKey="access_request.form.dataset" components={{ strong: <strong /> }} values={{ datasetName }} />
      </p>
      <p className={styles.Text}>{t('access_request.form.text')}</p>
      <TextInput {...textInput('name')} />
      <TextInput {...textInput('email')} type="email" />
      <Dropdown
        {...field('country')}
        size="small"
        options={countryOptions}
        placeholder={t('access_request.form.country_placeholder')}
        isSearchable
        noMatchesMessage={t('access_request.form.no_country_matches')}
        onChange={value => onFieldChange(value as string, 'country')}
      />
      <TextInput {...textInput('organisation')} />
      <TextInput {...textInput('organisationWebsite')} />
      <TextArea
        {...field('reason')}
        textareaClassName={styles.TextArea}
        placeholder={t('access_request.form.reason_placeholder')}
        rows={5}
        maxLength={REQUEST_REASON_MAX_LENGTH}
        showCounter
        symbolsLeftText={t('access_request.form.symbols_left')}
      />
      {!!themeConfig.privacyPolicyHtml && (
        <p className={styles.Privacy}>
          <Trans
            t={t}
            i18nKey="access_request.form.privacy"
            components={{ a: <a href={withBasePath(PRIVACY_POLICY_ROUTE)} rel="noopener noreferrer" target="_blank" /> }}
          />
        </p>
      )}
      {!!sendError && (
        <div ref={sendErrorRef}>
          <FormMessage type="error" withBackground message={sendError} />
        </div>
      )}
    </Dialog>
  );
}
