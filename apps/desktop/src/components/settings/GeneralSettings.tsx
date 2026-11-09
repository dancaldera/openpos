import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useTranslation } from '../../hooks/useTranslation'
import { SUPPORTED_CURRENCIES } from '../../services/company-settings-turso'
import { ConfirmAction } from '../page/ConfirmAction'
import { SettingsGroup } from './SettingsGroup'
import type { CompanySettingsForm } from './useCompanySettingsForm'

interface GeneralSettingsProps {
  form: CompanySettingsForm
}

/** Store details, receipt currency and tax, plus resetting them to defaults. */
export function GeneralSettings({ form }: GeneralSettingsProps) {
  const { t } = useTranslation()
  const { draft, isSaving, setField } = form
  if (!draft) return null

  return (
    <VStack gap={8}>
      <SettingsGroup title={t('settings.storeDetails')} description={t('settings.storeDetailsDesc')}>
        <TextInput
          label={t('settings.companyName')}
          description={t('settings.companyNameDesc')}
          value={draft.name}
          onChange={(value) => setField('name', value)}
          isRequired
          isDisabled={isSaving}
        />
        <TextInput
          label={t('common.description')}
          description={t('settings.descriptionDesc')}
          value={draft.description}
          onChange={(value) => setField('description', value)}
          isOptional
          isDisabled={isSaving}
        />
        <TextInput
          label={t('common.address')}
          value={draft.address}
          onChange={(value) => setField('address', value)}
          isOptional
          isDisabled={isSaving}
          autoComplete="street-address"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t('common.phone')}
            type="tel"
            value={draft.phone}
            onChange={(value) => setField('phone', value)}
            isOptional
            isDisabled={isSaving}
          />
          <TextInput
            label={t('common.email')}
            type="email"
            value={draft.email}
            onChange={(value) => setField('email', value)}
            isOptional
            isDisabled={isSaving}
          />
        </div>
        <TextInput
          label={t('settings.website')}
          type="url"
          value={draft.website}
          onChange={(value) => setField('website', value)}
          placeholder="https://example.com"
          isOptional
          isDisabled={isSaving}
          hasAutoCorrect={false}
          hasSpellCheck={false}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.receiptAndTax')} description={t('settings.receiptAndTaxDesc')}>
        <Selector
          label={t('settings.currency')}
          description={t('settings.currencyDesc')}
          value={draft.currencySymbol}
          onChange={(value) => setField('currencySymbol', value)}
          options={SUPPORTED_CURRENCIES.map((currency) => ({
            value: currency.symbol,
            label: `${currency.symbol}  ${currency.name}`,
          }))}
          isDisabled={isSaving}
          width="100%"
        />
        <Switch
          label={t('settings.enableTax')}
          description={t('settings.enableTaxDesc')}
          value={draft.taxEnabled}
          onChange={(checked) => setField('taxEnabled', checked)}
          isDisabled={isSaving}
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
        />
        {draft.taxEnabled && (
          <NumberInput
            label={t('settings.taxRate')}
            description={t('settings.taxRateDesc')}
            value={draft.taxPercentage}
            onChange={(value) => setField('taxPercentage', Number.isFinite(value) ? value : 0)}
            min={0}
            max={100}
            step={0.1}
            units="%"
            isDisabled={isSaving}
            width={200}
          />
        )}
      </SettingsGroup>

      {form.saveError && (
        <Banner
          status="error"
          title={t('settings.saveFailed')}
          description={form.saveError}
          collapsible={false}
          isDismissable
          onDismiss={form.clearSaveError}
        />
      )}

      <HStack gap={3} hAlign="end" vAlign="center" wrap="wrap">
        {form.isDirty && <Text type="supporting">{t('settings.unsavedChanges')}</Text>}
        <Button label={t('settings.discardChanges')} onClick={form.discard} isDisabled={!form.isDirty || isSaving} />
        <Button
          label={t('settings.saveChanges')}
          variant="primary"
          isLoading={isSaving}
          isDisabled={!form.isDirty}
          onClick={() => void form.save()}
        />
      </HStack>

      <SettingsGroup title={t('settings.resetDefaults')} description={t('settings.resetDefaultsDesc')}>
        <Text as="p" type="supporting">
          {t('settings.resetDescriptionShort')}
        </Text>
        <div>
          <ConfirmAction
            label={t('settings.resetDefaults')}
            title={t('settings.resetConfirm')}
            description={t('settings.resetWarning')}
            confirmLabel={t('settings.resetSettings')}
            cancelLabel={t('common.cancel')}
            onConfirm={form.resetToDefaults}
            variant="secondary"
            isDisabled={isSaving}
          />
        </div>
      </SettingsGroup>
    </VStack>
  )
}
