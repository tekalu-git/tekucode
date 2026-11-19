import { useLanguage } from "@/runtime/i18n/language"
import { useSettings } from "@/settings/model"
import { SettingsRow } from "@/settings/row"
import { InterfaceModeOptions } from "./interface-mode-options"

export function InterfaceModeSetting() {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <SettingsRow
      title={language.t("settings.general.row.interfaceMode.title")}
      description={language.t("settings.general.row.interfaceMode.description")}
      align="start"
    >
      <InterfaceModeOptions
        value={settings.appearance.tabLayout()}
        onChange={(layout) => settings.appearance.setTabLayout(layout)}
        action="settings-tab-layout"
      />
    </SettingsRow>
  )
}
