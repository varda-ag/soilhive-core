import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import { useMetadata, type SaveCallbacks } from 'hooks/useMetadata';
import { useEntitlements, ADMIN_PORTAL_ACCESS } from 'hooks/useEntitlementsHook';
import useDevice from 'hooks/useDevice';
import styles from './Metadata.module.scss';
import Worm from 'assets/images/worm.svg?react';
import SoilhiveSimpleMap from 'components/Map/SoilhiveSimpleMap';
import { Logo } from 'components/Logo/Logo';
import { Button, SplitButton } from 'components/UI';
import { getMetadataHeadValues } from 'utilities/buildMetadataHead';
import { upsertMeta } from 'utilities/upsertMeta';
import EyeIcon from 'assets/icons/small-eye-icon.svg?react';
import ReduceIcon from 'assets/icons/reduce-icon.svg?react';
import InfoIcon from 'assets/icons/info-icon.svg?react';
import { EditorRow } from 'components/Metadata/EditorRow/EditorRow';
import { LicenseRow } from 'components/Metadata/LicenseRow/LicenseRow';
import { NumberRow } from 'components/Metadata/NumberRow/NumberRow';
import { RelatedResourcesRow } from 'components/Metadata/RelatedResourcesRow/RelatedResourcesRow';
import { dateStringToDDMMYYYY } from 'utilities/date';

const GIS_DATATYPE_OPTIONS = [
  { code: 'point', name: 'Point' },
  { code: 'polygonal', name: 'Polygonal' },
  { code: 'raster', name: 'Raster' },
];

export default function Metadata() {
  const { id } = useParams();
  const { t } = useTranslation('metadata');
  const [isMounted, setIsMounted] = useState(false);
  const [isMapPopupOpen, setIsMapPopupOpen] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const { dataset, allLicenses, inferredProperties, isLoading, isError, updateProperty, updateRelatedResources } = useMetadata(id);
  const { can } = useEntitlements();
  const { isMobileLayout } = useDevice();
  const isAdmin = isMounted && !isMobileLayout && can(ADMIN_PORTAL_ACCESS);
  const [isEditing, setIsEditing] = useState(false);

  const onStartEditing: (property: string) => void = useCallback(() => {
    setIsEditing(true);
  }, []);

  const onSave = useCallback(
    (property: string, newValue: string, callbacks: SaveCallbacks) => {
      updateProperty(property, newValue, {
        onSuccess: () => {
          setIsEditing(false);
          callbacks.onSuccess();
        },
        onError: callbacks.onError,
      });
    },
    [updateProperty],
  );

  const onSaveRelatedResources = useCallback(
    (_property: string, newValue: string[], callbacks: SaveCallbacks) => {
      updateRelatedResources(newValue, {
        onSuccess: () => {
          setIsEditing(false);
          callbacks.onSuccess();
        },
        onError: callbacks.onError,
      });
    },
    [updateRelatedResources],
  );

  const onCancel: (property: string) => void = useCallback(() => {
    setIsEditing(false);
  }, []);

  useEffect(() => {
    if (!isMapPopupOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMapPopupOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMapPopupOpen]);

  const datasetName = dataset?.name;
  useEffect(() => {
    if (!datasetName) return;
    const v = getMetadataHeadValues(datasetName);
    document.title = v.title;
    upsertMeta('meta[name="description"]', 'name', 'description', v.description);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', v.title);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', v.siteName);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', v.url);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', v.description);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', v.image);
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', v.title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', v.description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', v.image);
  }, [datasetName]);

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleMapOverlayClick = () => {
    setIsMapPopupOpen(true);
  };

  const handleShareByEmail = () => {
    const subject = datasetName ? t('share.email_subject', { name: datasetName }) : t('share.email_subject_default');
    const body = window.location.href;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (isLoading) return <p>{t('loading')}</p>;
  if (isError) return <p>{t('error_load_failed')}</p>;

  return (
    <div className={styles.Page}>
      <div className={styles.Logo}>
        <Logo autoHeight />
      </div>
      <div className={styles.BannerContainer}>
        <div className={styles.Banner}>
          <div className={styles.Left}>
            <Worm className={styles.Worm} />
            <h1 className={styles.Title}>{t('title', { name: dataset!.name })}</h1>
            <p className={styles.Introduction}>{t('introduction')}</p>
            <div className={styles.Buttons}>
              <SplitButton
                className={styles.SplitButton}
                size="medium"
                options={[
                  { code: 'copy-link', name: t('share.copy_link'), onSelect: handleCopyLink },
                  { code: 'share-email', name: t('share.share_by_email'), onSelect: handleShareByEmail },
                  // TODO: implement the PDF export functionality
                  // { code: 'export-pdf', name: 'Export PDF', onSelect: handleExportPdf },
                ]}
              >
                {t('share.button')}
              </SplitButton>
              <Button type="secondary" size="medium" href="/">
                {t('go_to_platform')}
              </Button>
            </div>
          </div>
          <div className={styles.Right}>
            <p className={styles.Caption}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M13.7231 1.52082C14.5124 1.12618 15.4354 1.09905 16.2465 1.44667L21.1818 3.56177C22.2848 4.03451 23 5.11912 23 6.31921V18.9673C23 21.1211 20.7978 22.5732 18.8182 21.7248L15.4587 20.285C15.1883 20.1691 14.8806 20.1781 14.6175 20.3097L10.2769 22.48C9.48759 22.8746 8.56458 22.9018 7.75348 22.5542L2.81824 20.4391C1.71519 19.9663 1 18.8817 1 17.6816V5.03349C1 2.87975 3.20215 1.42765 5.18176 2.27606L8.54132 3.71587C8.81169 3.83174 9.11936 3.8227 9.38246 3.69115L13.7231 1.52082ZM16 3.51695V18.3536C16.0831 18.3809 16.1654 18.4119 16.2465 18.4467L19.6061 19.8865C20.2659 20.1693 21 19.6852 21 18.9673V6.31921C21 5.91918 20.7616 5.55764 20.3939 5.40006L16 3.51695ZM14 18.3994V3.61845L10.2769 5.48001C10.1862 5.52533 10.0938 5.56581 10 5.60143V20.3824L13.7231 18.5208C13.8138 18.4755 13.9062 18.435 14 18.3994ZM7.75348 5.55416C7.83462 5.58893 7.91687 5.61995 8 5.64723V20.4839L3.60608 18.6008C3.2384 18.4432 3 18.0816 3 17.6816V5.03349C3 4.31558 3.73405 3.83155 4.39392 4.11435L7.75348 5.55416Z"
                  fill="#0F0F0F"
                />
              </svg>
              {t('map.overview')}
            </p>
            <div className={styles.MapContainer}>
              <div className={styles.Map}>
                {isMounted && (
                  <>
                    <SoilhiveSimpleMap
                      geometryFeature={
                        dataset?.spatial_extent
                          ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: dataset.spatial_extent }] }
                          : undefined
                      }
                      geometryStyle="fill"
                      showNavigation={false}
                    />
                    <button type="button" className={styles.MapOverlay} onClick={handleMapOverlayClick} aria-label={t('map.view_aria')}>
                      <span className={styles.EyeBadge}>
                        <EyeIcon />
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.Content}>
        <div className={styles.DatasetProperties}>
          <div
            className={classnames(styles.TopRow, {
              [styles.AdminView]: isAdmin,
            })}
          >
            {isAdmin && (
              <div className={styles.AdminNotice}>
                <InfoIcon />
                <span>{t('admin_notice')}</span>
              </div>
            )}
            {!!dataset?.updated_at && (
              <p className={styles.LastUpdated} data-testid="sh-last-update">
                {t('last_update', {
                  date: dateStringToDDMMYYYY(dataset.updated_at, '/'),
                })}
              </p>
            )}
          </div>
          <EditorRow
            label={t('fields.name')}
            value={dataset?.name}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.name')}
            property="name"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.full_name')}
            value={dataset?.full_name}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.full_name')}
            property="full_name"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.version')}
            value={dataset?.version}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.version')}
            property="version"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.description')}
            value={dataset?.description}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.description')}
            property="description"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.author')}
            value={dataset?.author}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.author')}
            property="author"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          {/* TODO: will be used in the future */}
          {/* <EditorRow
            label={t('fields.data_producer')}
            value={dataset?.data_producer}
            isEditable={isAdmin && !isEditing}
            placeholder="Organization responsible for data collection and production"
            property="data_producer"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          /> */}
          {/* `variables_measured` will always be present in inferredProperties in newly ingested datasets. So it will always be uneditable. */}
          <EditorRow
            label={t('fields.variables_measured')}
            value={dataset?.soilProperties?.join(', ')}
            isEditable={false}
            property="soilProperties"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <NumberRow
            label={t('fields.min_soil_depth_cm')}
            value={(dataset?.soil_depth as { min?: number } | null | undefined)?.min}
            isEditable={isAdmin && !inferredProperties.has('soil_depth') && !isEditing}
            property="soil_depth_min"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <NumberRow
            label={t('fields.max_soil_depth_cm')}
            value={(dataset?.soil_depth as { max?: number } | null | undefined)?.max}
            isEditable={isAdmin && !inferredProperties.has('soil_depth') && !isEditing}
            property="soil_depth_max"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.gis_datatype')}
            value={GIS_DATATYPE_OPTIONS.find(o => o.code === dataset?.gis_datatype)?.name ?? dataset?.gis_datatype}
            isEditable={false}
            property="gis_datatype"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.spatial_resolution')}
            value={dataset?.spatial_resolution}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.spatial_resolution')}
            property="spatial_resolution"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.reference_period_start')}
            value={dataset?.reference_period_start}
            isEditable={isAdmin && !inferredProperties.has('reference_period_start') && !isEditing}
            placeholder={t('placeholders.reference_period_start')}
            property="reference_period_start"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.reference_period_stop')}
            value={dataset?.reference_period_stop}
            isEditable={isAdmin && !inferredProperties.has('reference_period_stop') && !isEditing}
            placeholder={t('placeholders.reference_period_stop')}
            property="reference_period_stop"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.publication_date')}
            value={dataset?.publication_date}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.publication_date')}
            property="publication_date"
            variant="text"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <LicenseRow
            label={t('fields.license')}
            currentLicenseIds={dataset?.licenses?.map(l => l.id) ?? []}
            allLicenses={allLicenses ?? []}
            isEditable={isAdmin && !inferredProperties.has('licenses') && !isEditing}
            property="licenses"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
          <EditorRow
            label={t('fields.citation')}
            value={dataset?.citation}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.citation')}
            property="citation"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
          />
        </div>

        <div className={styles.OptionalProperties}>
          <div className={styles.Title}>{t('optional_properties_title')}</div>
          <EditorRow
            label={t('fields.preprocessing_steps')}
            value={dataset?.preprocessing_steps}
            isEditable={isAdmin && !isEditing}
            placeholder={t('placeholders.preprocessing_steps')}
            displayPlaceholder="-"
            property="preprocessing_steps"
            onStartEditing={onStartEditing}
            onSave={onSave}
            onCancel={onCancel}
            disableBackground
          />
          <RelatedResourcesRow
            label={t('fields.related_resources')}
            value={dataset?.related_resources}
            isEditable={isAdmin && !isEditing}
            displayPlaceholder="-"
            property="related_resources"
            onStartEditing={onStartEditing}
            onSave={onSaveRelatedResources}
            onCancel={onCancel}
            disableBackground
          />
        </div>
      </div>

      <footer className={styles.Footer}>
        <div className={styles.Container}>
          <div className={styles.FooterTop}>
            <a href="https://www.varda.ag/" target="_blank" className={styles.FooterLink} rel="noreferrer">
              {t('footer.varda_website')}
            </a>
            <a href="https://www.varda.ag/#contact" target="_blank" className={styles.FooterLink} rel="noreferrer">
              {t('footer.contact')}
            </a>
          </div>
          <div className={styles.FooterBottom}>
            <p className={styles.FooterCopy}>{t('footer.copy')}</p>
            <div className={styles.FooterSocials}>
              <a
                href="https://www.linkedin.com/company/varda-field-data-exchange/"
                target="_blank"
                className="footer-social-link"
                rel="noreferrer"
              >
                <svg width="39" height="39" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M11.9824 32.1656C11.9824 32.2101 11.9463 32.2462 11.9018 32.2462H6.37314C6.32862 32.2462 6.29253 32.2101 6.29253 32.1656V14.0336C6.29253 13.989 6.32862 13.953 6.37314 13.953H11.9018C11.9463 13.953 11.9824 13.989 11.9824 14.0336V32.1656ZM9.16806 11.4445C8.27073 11.4445 7.49576 11.1182 6.84316 10.4656C6.19056 9.81301 5.86426 9.03804 5.86426 8.14071C5.86426 7.24339 6.19056 6.46842 6.84316 5.81582C7.49576 5.16322 8.27073 4.83691 9.16806 4.83691C10.0654 4.83691 10.8404 5.16322 11.493 5.81582C12.1456 6.46842 12.4719 7.24339 12.4719 8.14071C12.4719 8.71174 12.3087 9.26238 11.9824 9.79261C11.6969 10.2821 11.289 10.6899 10.7588 11.0162C10.2693 11.3018 9.73909 11.4445 9.16806 11.4445ZM33.2736 32.1656C33.2736 32.2101 33.2375 32.2462 33.1929 32.2462H27.6643C27.6198 32.2462 27.5837 32.2101 27.5837 32.1656V23.3137C27.5837 22.6203 27.5633 22.0697 27.5225 21.6618C27.4817 21.2132 27.3797 20.7237 27.2166 20.1935C27.0534 19.6224 26.7475 19.1942 26.2989 18.9087C25.891 18.6231 25.3404 18.4804 24.647 18.4804C23.301 18.4804 22.3833 18.9087 21.8938 19.7652C21.4451 20.6217 21.2208 21.7638 21.2208 23.1914V32.1656C21.2208 32.2101 21.1847 32.2462 21.1402 32.2462H15.6115C15.567 32.2462 15.5309 32.2101 15.5309 32.1656V14.0336C15.5309 13.989 15.567 13.953 15.6115 13.953H20.9567C21.0012 13.953 21.0373 13.989 21.0373 14.0336V16.4236C21.0373 16.4445 21.0542 16.4614 21.0751 16.4614V16.4614C21.0894 16.4614 21.1025 16.4533 21.109 16.4405C21.5178 15.6338 22.1873 14.9474 23.1174 14.3812C24.0556 13.7694 25.1772 13.4635 26.4824 13.4635C27.8692 13.4635 29.0113 13.6878 29.9086 14.1365C30.8467 14.5444 31.5401 15.1766 31.9888 16.0331C32.4782 16.8489 32.8045 17.7462 32.9677 18.7251C33.1716 19.704 33.2736 20.8665 33.2736 22.2125V32.1656Z"
                    stroke="white"
                    strokeWidth="1.93477"
                    strokeLinecap="round"
                  />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/channel/UCFx4LohqvmBJHyIYChBiong"
                target="_blank"
                className="footer-social-link"
                rel="noreferrer"
              >
                <svg width="39" height="39" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M15.9516 11.6396C15.4615 11.3596 14.8595 11.3616 14.3713 11.6449C13.8831 11.9282 13.5827 12.4499 13.5827 13.0143V25.681C13.5827 26.2454 13.8831 26.7671 14.3713 27.0504C14.8595 27.3337 15.4615 27.3357 15.9516 27.0557L27.0349 20.7224C27.5282 20.4405 27.8327 19.9158 27.8327 19.3477C27.8327 18.7795 27.5282 18.2548 27.0349 17.9729L15.9516 11.6396ZM23.058 19.3477L16.7493 22.9526V15.7427L23.058 19.3477Z"
                    fill="white"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M0.916016 19.3477C0.916016 13.4106 0.916016 10.442 2.42796 8.36102C2.91626 7.68894 3.5073 7.0979 4.17938 6.6096C6.2604 5.09766 9.22894 5.09766 15.166 5.09766H24.666C30.6031 5.09766 33.5716 5.09766 35.6526 6.6096C36.3247 7.0979 36.9158 7.68894 37.4041 8.36102C38.916 10.442 38.916 13.4106 38.916 19.3477C38.916 25.2847 38.916 28.2533 37.4041 30.3343C36.9158 31.0064 36.3247 31.5974 35.6526 32.0857C33.5716 33.5977 30.6031 33.5977 24.666 33.5977H15.166C9.22894 33.5977 6.2604 33.5977 4.17938 32.0857C3.5073 31.5974 2.91626 31.0064 2.42796 30.3343C0.916016 28.2533 0.916016 25.2847 0.916016 19.3477ZM15.166 8.26432H24.666C27.7051 8.26432 29.73 8.26867 31.2643 8.43489C32.7392 8.5947 33.3806 8.87308 33.7913 9.17149C34.1946 9.46447 34.5492 9.81909 34.8422 10.2223C35.1406 10.6331 35.419 11.2744 35.5788 12.7494C35.745 14.2836 35.7494 16.3086 35.7494 19.3477C35.7494 22.3867 35.745 24.4117 35.5788 25.9459C35.419 27.4209 35.1406 28.0622 34.8422 28.473C34.5492 28.8762 34.1946 29.2308 33.7913 29.5238C33.3806 29.8222 32.7392 30.1006 31.2643 30.2604C29.73 30.4266 27.7051 30.431 24.666 30.431H15.166C12.1269 30.431 10.102 30.4266 8.56777 30.2604C7.0928 30.1006 6.45143 29.8222 6.0407 29.5238C5.63745 29.2308 5.28283 28.8762 4.98985 28.473C4.69144 28.0622 4.41305 27.4209 4.25325 25.9459C4.08703 24.4117 4.08268 22.3867 4.08268 19.3477C4.08268 16.3086 4.08703 14.2836 4.25325 12.7494C4.41305 11.2744 4.69144 10.6331 4.98985 10.2223C5.28283 9.81909 5.63745 9.46447 6.0407 9.17149C6.45143 8.87308 7.0928 8.5947 8.56777 8.43489C10.102 8.26867 12.1269 8.26432 15.166 8.26432Z"
                    fill="white"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {isMapPopupOpen && (
        <div
          className={styles.MapPopupBackdrop}
          onClick={() => setIsMapPopupOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('map.preview_aria')}
        >
          <div className={styles.MapPopup} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={styles.MapPopupClose}
              onClick={() => setIsMapPopupOpen(false)}
              aria-label={t('map.close_aria')}
            >
              <ReduceIcon />
            </button>
            <SoilhiveSimpleMap
              geometryFeature={
                dataset?.spatial_extent
                  ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: dataset.spatial_extent }] }
                  : undefined
              }
              geometryStyle="fill"
              showNavigation={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
