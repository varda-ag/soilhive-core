import { Accordion, FormMessage, NestedCheckbox, SelectionPills, Toggle } from 'components/UI';
import { collectParentsIds, filterNestedItems } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import BiologicalIcon from 'assets/icons/biological-icon.svg?react';
import ChemicalIcon from 'assets/icons/chemical-icon.svg?react';
import DerivedIcon from 'assets/icons/derived-icon.svg?react';
import PhysicalIcon from 'assets/icons/physical-icon.svg?react';
import type { AccordionRef, NestedCheckboxRef } from 'types/components';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';

import styles from './FilteringSidebarParameters.module.scss';
import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import { useTranslation } from 'react-i18next';

const CATEGORIES_ICONS_MAP: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  biological: BiologicalIcon,
  chemical: ChemicalIcon,
  derived: DerivedIcon,
  physical: PhysicalIcon,
};

export function FilteringSidebarParameters({ hasSoilGroupsRasterFilter = false }: { hasSoilGroupsRasterFilter?: boolean }) {
  const {
    isLoading,
    isNoData,
    isNoFilteredData,
    categorizedSoilProperties,
    selectedSoilProperties,
    pillSelections,
    handleOnChange,
    handlePillRemove,
  } = useSoilPropertiesFilters();

  const { t } = useTranslation('availability');

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [accordionOpenByCategory, setAccordionOpenByCategory] = useState<Record<string, boolean>>({});
  const [checkboxExpandedByCategory, setCheckboxExpandedByCategory] = useState<Record<string, boolean>>({});
  const accordionRefs = useRef<Record<string, AccordionRef | null>>({});
  const checkboxRefs = useRef<Record<string, NestedCheckboxRef | null>>({});

  const setCheckboxRef = useCallback((categoryId: string) => {
    return (instance: NestedCheckboxRef | null) => {
      checkboxRefs.current[categoryId] = instance;
    };
  }, []);

  const setAccordionRef = useCallback((categoryId: string) => {
    return (instance: AccordionRef | null) => {
      accordionRefs.current[categoryId] = instance;
    };
  }, []);

  const filteredProperties = useMemo(
    () =>
      categorizedSoilProperties
        .map(category => ({ ...category, nodes: filterNestedItems(category.nodes, searchTerm) }))
        .filter(category => category.nodes.length),
    [categorizedSoilProperties, searchTerm],
  );

  const expandAll = useCallback(() => {
    Object.values(checkboxRefs.current).forEach(ref => ref?.expandAll());
    Object.values(accordionRefs.current).forEach(ref => ref?.expand());

    setAccordionOpenByCategory(prev => {
      const next = { ...prev };
      for (const cat of filteredProperties) next[cat.id] = true;
      return next;
    });

    setCheckboxExpandedByCategory(prev => {
      const next = { ...prev };
      for (const prop of filteredProperties) next[prop.id] = true;
      return next;
    });
  }, [filteredProperties]);

  const collapseAll = useCallback(() => {
    Object.values(checkboxRefs.current).forEach(ref => ref?.collapseAll());
    Object.values(accordionRefs.current).forEach(ref => ref?.collapse());

    setAccordionOpenByCategory(prev => {
      const next = { ...prev };
      for (const prop of filteredProperties) next[prop.id] = false;
      return next;
    });
    setCheckboxExpandedByCategory(prev => {
      const next = { ...prev };
      for (const prop of filteredProperties) next[prop.id] = false;
      return next;
    });
  }, [filteredProperties]);

  const parentPropertiesByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const category of categorizedSoilProperties) {
      map[category.id] = collectParentsIds(category.nodes);
    }
    return map;
  }, [categorizedSoilProperties]);

  const handleSearch = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
      expandAll();
    },
    [expandAll],
  );

  const isCategoryCheckboxExpanded = useCallback(
    (categoryId: string) => {
      const parents = parentPropertiesByCategory[categoryId] ?? [];
      if (parents.length === 0) return true;
      return checkboxExpandedByCategory[categoryId] ?? false;
    },
    [parentPropertiesByCategory, checkboxExpandedByCategory],
  );

  const soilPropertiesExpanded = useMemo(() => {
    const ids = filteredProperties.map(c => c.id);
    if (ids.length === 0) return false;

    return ids.every(id => {
      const accOpen = accordionOpenByCategory[id] ?? false;
      const cbOpen = isCategoryCheckboxExpanded(id);
      return accOpen && cbOpen;
    });
  }, [filteredProperties, accordionOpenByCategory, isCategoryCheckboxExpanded]);

  const handleProperitesExpansionToggle = useCallback(() => {
    if (soilPropertiesExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
  }, [collapseAll, expandAll, soilPropertiesExpanded]);

  const handleAccordionToggle = useCallback((categoryId: string, isOpened: boolean) => {
    setAccordionOpenByCategory(prev => ({ ...prev, [categoryId]: isOpened }));
  }, []);

  const handleToggleVisibility = useCallback(
    (categoryId: string, expandedIds: string[]) => {
      const parents = parentPropertiesByCategory[categoryId] ?? [];
      const allExpandedForThisCategory = parents.length === 0 ? true : parents.every(id => expandedIds.includes(id));

      setCheckboxExpandedByCategory(prev => ({ ...prev, [categoryId]: allExpandedForThisCategory }));
    },
    [parentPropertiesByCategory],
  );

  return (
    <div className={styles.FilteringSidebarParameters}>
      <Accordion
        title={t('filtering_sidebar_content.soil_properties', 'Soil Properties')}
        type="secondary"
        pillsSlot={pillSelections.length > 0 ? <SelectionPills selections={pillSelections} onRemove={handlePillRemove} /> : null}
      >
        {isNoData && (
          <div data-testid="sh-unavailable-filter-message" className={styles.WarningMessage}>
            <FormMessage message={t('filter.no_filter_available', 'No filter is available')} type="warning" withBackground={true} />
          </div>
        )}
        {!isNoData && !isNoFilteredData && (
          <div className={styles.SoilProperties}>
            <input
              type="text"
              placeholder={t('filtering_sidebar.search_placeholder')}
              value={searchTerm}
              onChange={handleSearch}
              className={styles.SearchInput}
            />
            <Toggle
              className={styles.Toggle}
              labelOne="Expand All"
              labelTwo="Collapse All"
              isToggled={soilPropertiesExpanded}
              onToggle={handleProperitesExpansionToggle}
            />
            {isLoading ? (
              <span data-testid="skeleton-container">
                <Skeleton count={1} height={120} />
              </span>
            ) : (
              <div data-testid="properties-list" className={styles.SoilPropertiesList}>
                {filteredProperties.map(category => (
                  <Accordion
                    ref={setAccordionRef(category.id)}
                    key={category.id}
                    openedFromStart={!!accordionOpenByCategory[category.id] || soilPropertiesExpanded}
                    title={category.category_name}
                    type="tertiary"
                    Icon={CATEGORIES_ICONS_MAP[category.id]}
                    onToggle={isOpened => handleAccordionToggle(category.id, isOpened)}
                  >
                    <NestedCheckbox
                      ref={setCheckboxRef(category.id)}
                      className={styles.SoilPropertiesCheckbox}
                      items={category.nodes}
                      selected={selectedSoilProperties}
                      onChange={handleOnChange}
                      onToggleVisibility={expandedIds => handleToggleVisibility(category.id, expandedIds)}
                    />
                  </Accordion>
                ))}
              </div>
            )}
          </div>
        )}
      </Accordion>
      {hasSoilGroupsRasterFilter && <RasterFilter categoryId="soil_groups" />}
    </div>
  );
}
