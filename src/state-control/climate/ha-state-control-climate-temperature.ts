import { mdiMinus, mdiPlus, mdiThermometer } from "@mdi/js";
import { CSSResultGroup, LitElement, PropertyValues, css, html } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { UNIT_F } from "../../common/const";
import { stateActive } from "../../common/entity/state_active";
import { stateColorCss } from "../../common/entity/state_color";
import { supportsFeature } from "../../common/entity/supports-feature";
import { clamp } from "../../common/number/clamp";
import { debounce } from "../../common/util/debounce";
import "../../components/ha-big-number";
import "../../components/ha-control-circular-slider";
import type { ControlCircularSliderMode } from "../../components/ha-control-circular-slider";
import "../../components/ha-outlined-icon-button";
import "../../components/ha-svg-icon";
import {
  CLIMATE_HVAC_ACTION_TO_MODE,
  ClimateEntity,
  ClimateEntityFeature,
  HvacMode,
} from "../../data/climate";
import { UNAVAILABLE } from "../../data/entity";
import { HomeAssistant } from "../../types";
import {
  createStateControlCircularSliderController,
  stateControlCircularSliderStyle,
} from "../state-control-circular-slider-style";

type Target = "value" | "low" | "high";

const SLIDER_MODES: Record<HvacMode, ControlCircularSliderMode> = {
  auto: "full",
  cool: "end",
  dry: "full",
  fan_only: "full",
  heat: "start",
  heat_cool: "full",
  off: "full",
};

@customElement("ha-state-control-climate-temperature")
export class HaStateControlClimateTemperature extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public stateObj!: ClimateEntity;

  @property({ attribute: "show-current", type: Boolean })
  public showCurrent?: boolean;

  @state() private _targetTemperature: Partial<Record<Target, number>> = {};

  @state() private _selectTargetTemperature: Target = "low";

  private _sizeController = createStateControlCircularSliderController(this);

  protected willUpdate(changedProp: PropertyValues): void {
    super.willUpdate(changedProp);
    if (changedProp.has("stateObj")) {
      this._targetTemperature = {
        value: this.stateObj.attributes.temperature,
        low: this.stateObj.attributes.target_temp_low,
        high: this.stateObj.attributes.target_temp_high,
      };
    }
  }

  private get _step() {
    return (
      this.stateObj.attributes.target_temp_step ||
      (this.hass.config.unit_system.temperature === UNIT_F ? 1 : 0.5)
    );
  }

  private get _min() {
    return this.stateObj.attributes.min_temp;
  }

  private get _max() {
    return this.stateObj.attributes.max_temp;
  }

  private _valueChanged(ev: CustomEvent) {
    const value = (ev.detail as any).value;
    if (isNaN(value)) return;
    const target = ev.type.replace("-changed", "");
    this._targetTemperature = {
      ...this._targetTemperature,
      [target]: value,
    };
    this._selectTargetTemperature = target as Target;
    this._callService(target);
  }

  private _valueChanging(ev: CustomEvent) {
    const value = (ev.detail as any).value;
    if (isNaN(value)) return;
    const target = ev.type.replace("-changing", "");
    this._targetTemperature = {
      ...this._targetTemperature,
      [target]: value,
    };
    this._selectTargetTemperature = target as Target;
  }

  private _debouncedCallService = debounce(
    (target: Target) => this._callService(target),
    1000
  );

  private _callService(type: string) {
    if (type === "high" || type === "low") {
      this.hass.callService("climate", "set_temperature", {
        entity_id: this.stateObj!.entity_id,
        target_temp_low: this._targetTemperature.low,
        target_temp_high: this._targetTemperature.high,
      });
      return;
    }
    this.hass.callService("climate", "set_temperature", {
      entity_id: this.stateObj!.entity_id,
      temperature: this._targetTemperature.value,
    });
  }

  private _handleButton(ev) {
    const target = ev.currentTarget.target as Target;
    const step = ev.currentTarget.step as number;

    const defaultValue = target === "high" ? this._max : this._min;

    let temp = this._targetTemperature[target] ?? defaultValue;
    temp += step;
    temp = clamp(temp, this._min, this._max);
    if (target === "high" && this._targetTemperature.low != null) {
      temp = clamp(temp, this._targetTemperature.low, this._max);
    }
    if (target === "low" && this._targetTemperature.high != null) {
      temp = clamp(temp, this._min, this._targetTemperature.high);
    }

    this._targetTemperature = {
      ...this._targetTemperature,
      [target]: temp,
    };
    this._debouncedCallService(target);
  }

  private _handleSelectTemp(ev) {
    const target = ev.currentTarget.target as Target;
    this._selectTargetTemperature = target;
  }

  private _renderLabel() {
    if (this.stateObj.state === UNAVAILABLE) {
      return html`
        <p class="label disabled">
          ${this.hass.formatEntityState(this.stateObj, UNAVAILABLE)}
        </p>
      `;
    }

    if (
      !supportsFeature(
        this.stateObj,
        ClimateEntityFeature.TARGET_TEMPERATURE
      ) &&
      !supportsFeature(
        this.stateObj,
        ClimateEntityFeature.TARGET_TEMPERATURE_RANGE
      )
    ) {
      return html`
        <p class="label">${this.hass.formatEntityState(this.stateObj)}</p>
      `;
    }

    const action = this.stateObj.attributes.hvac_action;

    const actionLabel = this.hass.formatEntityAttributeValue(
      this.stateObj,
      "hvac_action"
    );

    return html`
      <p class="label">
        ${action && action !== "off" && action !== "idle"
          ? actionLabel
          : this.hass.localize("ui.card.climate.target")}
      </p>
    `;
  }

  private _renderTemperatureButtons(target: Target, colored?: boolean) {
    const lowColor = stateColorCss(this.stateObj, "heat");
    const highColor = stateColorCss(this.stateObj, "cool");

    const color =
      colored && stateActive(this.stateObj)
        ? target === "high"
          ? highColor
          : lowColor
        : undefined;

    return html`
      <div class="buttons">
        <ha-outlined-icon-button
          style=${styleMap({
            "--md-sys-color-outline": color,
          })}
          .target=${target}
          .step=${-this._step}
          @click=${this._handleButton}
        >
          <ha-svg-icon .path=${mdiMinus}></ha-svg-icon>
        </ha-outlined-icon-button>
        <ha-outlined-icon-button
          style=${styleMap({
            "--md-sys-color-outline": color,
          })}
          .target=${target}
          .step=${this._step}
          @click=${this._handleButton}
        >
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
        </ha-outlined-icon-button>
      </div>
    `;
  }

  private _renderTargetTemperature(temperature: number) {
    const digits = this._step.toString().split(".")?.[1]?.length ?? 0;
    const formatOptions: Intl.NumberFormatOptions = {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    };
    return html`
      <ha-big-number
        .value=${temperature}
        .unit=${this.hass.config.unit_system.temperature}
        .hass=${this.hass}
        .formatOptions=${formatOptions}
      ></ha-big-number>
    `;
  }

  private _renderCurrentTemperature(temperature?: number) {
    if (!this.showCurrent || temperature == null) {
      return html`<p class="label">&nbsp;</p>`;
    }

    return html`
      <p class="label current">
        <ha-svg-icon .path=${mdiThermometer}></ha-svg-icon>
        <span>
          ${this.hass.formatEntityAttributeValue(
            this.stateObj,
            "current_temperature",
            temperature
          )}
        </span>
      </p>
    `;
  }

  protected render() {
    const supportsTargetTemperature = supportsFeature(
      this.stateObj,
      ClimateEntityFeature.TARGET_TEMPERATURE
    );

    const supportsTargetTemperatureRange = supportsFeature(
      this.stateObj,
      ClimateEntityFeature.TARGET_TEMPERATURE_RANGE
    );

    const mode = this.stateObj.state;
    const action = this.stateObj.attributes.hvac_action;
    const active = stateActive(this.stateObj);

    const stateColor = stateColorCss(this.stateObj);
    const lowColor = stateColorCss(this.stateObj, active ? "heat" : "off");
    const highColor = stateColorCss(this.stateObj, active ? "cool" : "off");

    let actionColor: string | undefined;
    if (action && action !== "idle" && action !== "off" && active) {
      actionColor = stateColorCss(
        this.stateObj,
        CLIMATE_HVAC_ACTION_TO_MODE[action]
      );
    }

    const containerSizeClass = this._sizeController.value
      ? { [this._sizeController.value]: true }
      : {};

    if (
      supportsTargetTemperature &&
      this._targetTemperature.value != null &&
      this.stateObj.state !== UNAVAILABLE
    ) {
      const heatCoolModes = this.stateObj.attributes.hvac_modes.filter((m) =>
        ["heat", "cool", "heat_cool"].includes(m)
      );
      const sliderMode =
        SLIDER_MODES[
          heatCoolModes.length === 1 && ["off", "auto"].includes(mode)
            ? heatCoolModes[0]
            : mode
        ];

      return html`
        <div
          class="container${classMap(containerSizeClass)}"
          style=${styleMap({
            "--state-color": stateColor,
            "--action-color": actionColor,
          })}
        >
          <ha-control-circular-slider
            .inactive=${!active}
            .mode=${sliderMode}
            .value=${this._targetTemperature.value}
            .min=${this._min}
            .max=${this._max}
            .step=${this._step}
            .current=${this.stateObj.attributes.current_temperature}
            @value-changed=${this._valueChanged}
            @value-changing=${this._valueChanging}
          >
          </ha-control-circular-slider>
          <div class="info">
            ${this._renderLabel()}
            ${this._renderTargetTemperature(this._targetTemperature.value)}
            ${this._renderCurrentTemperature(
              this.stateObj.attributes.current_temperature
            )}
          </div>
          ${this._renderTemperatureButtons("value")}
        </div>
      `;
    }

    if (
      supportsTargetTemperatureRange &&
      this._targetTemperature.low != null &&
      this._targetTemperature.high != null &&
      this.stateObj.state !== UNAVAILABLE
    ) {
      return html`
        <div
          class="container${classMap(containerSizeClass)}"
          style=${styleMap({
            "--low-color": lowColor,
            "--high-color": highColor,
            "--action-color": actionColor,
          })}
        >
          <ha-control-circular-slider
            .inactive=${!active}
            dual
            .low=${this._targetTemperature.low}
            .high=${this._targetTemperature.high}
            .min=${this._min}
            .max=${this._max}
            .step=${this._step}
            .current=${this.stateObj.attributes.current_temperature}
            @low-changed=${this._valueChanged}
            @low-changing=${this._valueChanging}
            @high-changed=${this._valueChanged}
            @high-changing=${this._valueChanging}
          >
          </ha-control-circular-slider>
          <div class="info">
            ${this._renderLabel()}
            <div class="dual">
              <button
                @click=${this._handleSelectTemp}
                .target=${"low"}
                class=${classMap({
                  selected: this._selectTargetTemperature === "low",
                })}
              >
                ${this._renderTargetTemperature(this._targetTemperature.low)}
              </button>
              <button
                @click=${this._handleSelectTemp}
                .target=${"high"}
                class=${classMap({
                  selected: this._selectTargetTemperature === "high",
                })}
              >
                ${this._renderTargetTemperature(this._targetTemperature.high)}
              </button>
            </div>
            ${this._renderCurrentTemperature(
              this.stateObj.attributes.current_temperature
            )}
          </div>
          ${this._renderTemperatureButtons(this._selectTargetTemperature, true)}
        </div>
      `;
    }

    return html`
      <div
        class="container${classMap({
          [this._sizeController.value ?? ""]: true,
        })}"
        style=${styleMap({
          "--state-color": stateColor,
        })}
      >
        <ha-control-circular-slider
          mode="full"
          .current=${this.stateObj.attributes.current_temperature}
          .min=${this._min}
          .max=${this._max}
          .step=${this._step}
          readonly
          .disabled=${!active}
        >
        </ha-control-circular-slider>
        <div class="info">
          ${this._renderLabel()}
          ${this._renderCurrentTemperature(
            this.stateObj.attributes.current_temperature
          )}
        </div>
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      stateControlCircularSliderStyle,
      css`
        /* Dual target */
        .dual {
          display: flex;
          flex-direction: row;
          gap: 24px;
        }
        .dual button {
          outline: none;
          background: none;
          color: inherit;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
          border: none;
          opacity: 0.5;
          padding: 0;
          transition:
            opacity 180ms ease-in-out,
            transform 180ms ease-in-out;
          cursor: pointer;
        }
        .dual button:focus-visible {
          transform: scale(1.1);
        }
        .dual button.selected {
          opacity: 1;
        }
        .container.md .dual {
          gap: 16px;
        }
        .container.sm .dual,
        .container.xs .dual {
          gap: 8px;
        }
        ha-control-circular-slider {
          --control-circular-slider-low-color: var(
            --low-color,
            var(--disabled-color)
          );
          --control-circular-slider-high-color: var(
            --high-color,
            var(--disabled-color)
          );
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-climate-temperature": HaStateControlClimateTemperature;
  }
}
