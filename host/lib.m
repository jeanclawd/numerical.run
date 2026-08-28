% streamlab — a Streamlit-like library in pure .m code, running on the RunMat runtime.
%
% The Streamlit model, unchanged: your script IS the app. It runs top to
% bottom on every interaction; widgets are function calls that return their
% current value; whatever you emit appears on the page in order.
%
%     sl_title('Wave explorer');
%     n = sl_slider('points', 10, 500, 200);
%     f = sl_slider('frequency', 1, 8, 2);
%     x = linspace(0, 2*pi, n);
%     figure; plot(x, sin(f * x)); sl_figure();
%     sl_metric('peak', max(gather(sin(f * x))));
%
% How it works (no magic in the runtime): every sl_* call prints one line,
%     %%SL%%{...json...}
% to stdout. The host page parses those markers, renders the elements, and on
% any widget change re-runs the script with the new state. State reaches the
% script through sl_state_() — a function whose body the HOST regenerates and
% appends on every run (RunMat 0.6.1 note: script-local functions are redefined
% wholesale per execution, and `global` is broken, so baked-in state is both
% the simplest and the only reliable channel).
%
% This file holds only functions — the host appends it (plus the generated
% sl_state_) AFTER the user's script, per the RunMat runtime's script-with-functions rule.

% ---- plumbing ---------------------------------------------------------------

function e = sl_at_(a, q)
% Uniform indexing: jsondecode returns cell arrays for mixed JSON arrays but
% plain/string arrays for homogeneous ones.
    if iscell(a)
        e = a{q};
    else
        e = a(q);
    end
end

function v = sl_get_(label, default)
% Current state value for a widget, else its default. The host appends a
% numeric sentinel pair to the state arrays so jsondecode always yields
% indexable cells (single-element / homogeneous JSON arrays otherwise collapse
% into scalars or string matrices) — non-text keys are skipped here.
    st = sl_state_();
    v = default;
    n = numel(st.keys);
    for q = 1:n
        kk = sl_at_(st.keys, q);
        if ischar(kk) || isstring(kk)
            if strcmp(kk, label)
                v = sl_at_(st.values, q);
            end
        end
    end
end

function sl_emit_(s)
    fprintf('%s\n', ['%%SL%%' jsonencode(s)]);
end

% ---- static elements --------------------------------------------------------

function sl_title(text)
    sl_emit_(struct('type', 'title', 'text', text));
end

function sl_header(text)
    sl_emit_(struct('type', 'header', 'text', text));
end

function sl_text(varargin)
% sl_text('mean is %g', m) — sprintf-style.
    sl_emit_(struct('type', 'text', 'text', sprintf(varargin{:})));
end

function sl_caption(varargin)
    sl_emit_(struct('type', 'caption', 'text', sprintf(varargin{:})));
end

function sl_divider()
    sl_emit_(struct('type', 'divider'));
end

function sl_metric(label, value, varargin)
% sl_metric(label, value [, fmt [, delta]]) — delta renders as an up/down arrow.
    if nargin >= 3
        shown = sprintf(varargin{1}, value);
    else
        shown = sprintf('%.4g', value);
    end
    s = struct('type', 'metric', 'label', label, 'value', shown);
    if nargin >= 4
        d = varargin{2};
        if ischar(d)
            s.delta = d;
        else
            s.delta = sprintf('%.4g', d);
        end
    end
    sl_emit_(s);
end

% ---- widgets (return their current value) -----------------------------------

function v = sl_slider(label, minv, maxv, varargin)
% v = sl_slider(label, min, max [, default [, step]])
    if nargin >= 4
        default = varargin{1};
    else
        default = (minv + maxv) / 2;
    end
    if nargin >= 5
        step = varargin{2};
    else
        step = (maxv - minv) / 100;
    end
    v = double(sl_get_(label, default));
    if v < minv
        v = minv;
    end
    if v > maxv
        v = maxv;
    end
    sl_emit_(struct('type', 'slider', 'label', label, ...
                    'min', minv, 'max', maxv, 'step', step, 'value', v));
end

function v = sl_checkbox(label, varargin)
% v = sl_checkbox(label [, default])
    if nargin >= 2
        default = varargin{1};
    else
        default = false;
    end
    v = logical(sl_get_(label, default));
    sl_emit_(struct('type', 'checkbox', 'label', label, 'value', v));
end

function v = sl_selectbox(label, options, varargin)
% v = sl_selectbox(label, {'a','b','c'} [, default])  — returns the chosen char.
    if nargin >= 3
        default = varargin{1};
    else
        default = options{1};
    end
    v = char(sl_get_(label, default));
    ok = false;
    for q = 1:numel(options)
        if strcmp(options{q}, v)
            ok = true;
        end
    end
    if ~ok
        v = options{1};
    end
    % RunMat 0.6.1 turns struct('f', {cell}) into a struct ARRAY (the 1x1-cell
    % wrapper idiom is not honoured) — assign the cell field afterwards instead.
    s = struct('type', 'selectbox', 'label', label, 'value', v);
    s.options = options;
    sl_emit_(s);
end

function v = sl_button(label)
% True only on the run triggered by this button's click (Streamlit semantics —
% the host clears it after the run).
    v = logical(sl_get_(label, false));
    sl_emit_(struct('type', 'button', 'label', label));
end

function v = sl_text_input(label, varargin)
    if nargin >= 2
        default = varargin{1};
    else
        default = '';
    end
    v = char(sl_get_(label, default));
    sl_emit_(struct('type', 'text_input', 'label', label, 'value', v));
end

% ---- figures ------------------------------------------------------------------

function sl_figure()
% Place the most recently drawn figure here. The host pairs the Nth figure
% marker with the Nth figure the run touched and renders it as SVG.
    sl_emit_(struct('type', 'figure'));
end

function sl_plot(x, y, varargin)
% Convenience: figure + plot + placement in one call.
    figure;
    plot(x, y, varargin{:});
    sl_figure();
end

% ---- v0.2: layout ------------------------------------------------------------

function sl_sidebar()
% Everything emitted after this lands in the left sidebar (until sl_main).
    sl_emit_(struct('type', 'region', 'target', 'sidebar'));
end

function sl_main()
% Return the flow to the main column.
    sl_emit_(struct('type', 'region', 'target', 'main'));
end

function sl_columns(n)
% Begin an n-column group; sl_nextcol() advances, sl_endcols() closes.
    sl_emit_(struct('type', 'columns', 'count', n));
end

function sl_nextcol()
    sl_emit_(struct('type', 'nextcol'));
end

function sl_endcols()
    sl_emit_(struct('type', 'endcols'));
end

% ---- v0.2: data display --------------------------------------------------------

function sl_dataframe(M, varargin)
% sl_dataframe(M [, columnNames cell]) — a matrix as a table (first 100 rows).
    maxrows = 100;
    nr = size(M, 1);
    shown = M(1:min(nr, maxrows), :);
    s = struct('type', 'dataframe', 'truncated', nr > maxrows);
    s.data = shown;               % jsonencode emits row-nested arrays
    if nargin >= 2
        s.columns = varargin{1};
    end
    sl_emit_(s);
end

% ---- v0.2: widgets ----------------------------------------------------------------

function v = sl_radio(label, options, varargin)
% v = sl_radio(label, {'a','b'} [, default]) — one choice, radio-rendered.
    if nargin >= 3
        default = varargin{1};
    else
        default = options{1};
    end
    v = char(sl_get_(label, default));
    ok = false;
    for q = 1:numel(options)
        if strcmp(options{q}, v)
            ok = true;
        end
    end
    if ~ok
        v = options{1};
    end
    s = struct('type', 'radio', 'label', label, 'value', v);
    s.options = options;
    sl_emit_(s);
end

function v = sl_multiselect(label, options, varargin)
% v = sl_multiselect(label, {'a','b','c'} [, default cell]) — cell of chosen.
    if nargin >= 3
        default = varargin{1};
    else
        default = {};
    end
    raw = sl_get_(label, default);
    v = sl_tocellstr_(raw);
    kept = {};
    for q = 1:numel(options)
        for r = 1:numel(v)
            if strcmp(options{q}, v{r})
                kept{end+1} = options{q}; %#ok<AGROW>
            end
        end
    end
    v = kept;
    s = struct('type', 'multiselect', 'label', label);
    s.value = v;
    s.options = options;
    sl_emit_(s);
end

function c = sl_tocellstr_(raw)
% Normalize jsondecode's shapes (cell / string array / char / empty) to a cell of char.
    c = {};
    if iscell(raw)
        for q = 1:numel(raw)
            c{end+1} = char(raw{q}); %#ok<AGROW>
        end
    elseif isempty(raw)
        c = {};
    elseif ischar(raw)
        c = {raw};
    else
        for q = 1:numel(raw)
            c{end+1} = char(raw(q)); %#ok<AGROW>
        end
    end
end

function v = sl_number_input(label, varargin)
% v = sl_number_input(label [, default [, min, max [, step]]])
    if nargin >= 2
        default = varargin{1};
    else
        default = 0;
    end
    v = double(sl_get_(label, default));
    s = struct('type', 'number_input', 'label', label, 'value', v);
    if nargin >= 4
        s.min = varargin{2};
        s.max = varargin{3};
        if v < s.min
            v = s.min;
        end
        if v > s.max
            v = s.max;
        end
        s.value = v;
    end
    if nargin >= 5
        s.step = varargin{4};
    end
    sl_emit_(s);
end

% ---- v0.2: session state --------------------------------------------------------

function v = sl_state(key, default)
% Read arbitrary session state (survives reruns; not tied to a widget).
    v = sl_get_(key, default);
end

function sl_state_set(key, value)
% Write session state. Applied after the run — it does NOT trigger a rerun.
    s = struct('type', 'set_state', 'key', key);
    s.value = value;
    sl_emit_(s);
end
