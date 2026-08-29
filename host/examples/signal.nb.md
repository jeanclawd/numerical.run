# Signal processing & mel spectrograms

A tiny DSP pipeline running entirely in your browser on the RunMat kernel: build a
chirp, look at its spectrum, design a **mel filterbank**, and compute a **mel
spectrogram**. Drag the sliders (App mode) to hear the maths move.

+++

## 1 · A chirp signal

A linear chirp sweeps from a start to an end frequency; we add a little 50 Hz hum.

```matlab {jupyter.code-cell}
fs  = 8000;                       % sample rate (Hz)
dur = 1.0;                        % seconds
f0  = nr_slider('chirp start (Hz)', 100, 1000, 200, 50);
f1  = nr_slider('chirp end (Hz)',   500, 3500, 2200, 50);
hum = nr_slider('50 Hz hum', 0, 0.5, 0.1, 0.05);

t = (0:round(fs*dur)-1) / fs;
phase = 2*pi * (f0*t + 0.5*(f1-f0)*t.^2/dur);   % linear-chirp phase
x = sin(phase) + hum*sin(2*pi*50*t);

figure; plot(t, x); nr_figure();
nr_text('%d samples at %d Hz', numel(x), fs);
```

+++

## 2 · Magnitude spectrum

The single-sided FFT magnitude — energy smeared across the swept band.

```matlab {jupyter.code-cell}
N    = numel(x);
X    = abs(fft(x));
half = 1:floor(N/2)+1;
freq = (half-1) * fs / N;
figure; plot(freq, X(half)); nr_figure();
nr_caption('single-sided magnitude spectrum (Hz)');
```

+++

## 3 · Mel filterbank

Human pitch perception is roughly logarithmic. A mel filterbank is a set of
triangular windows, evenly spaced on the **mel** scale, that pool FFT bins into
perceptual bands.

```matlab {jupyter.code-cell}
nfft  = 256;
nmels = nr_slider('mel bands', 16, 48, 32, 4);
nbins = nfft/2 + 1;
fbin  = (0:nbins-1) * fs / nfft;                 % Hz of each FFT bin

melmax = 2595*log10(1 + (fs/2)/700);
melpts = linspace(0, melmax, nmels+2);
hzpts  = 700 .* (exp(melpts .* (log(10)/2595)) - 1);   % band edges in Hz

fb = zeros(nmels, nbins);
for m = 1:nmels
    lo = hzpts(m); mid = hzpts(m+1); hi = hzpts(m+2);
    for b = 1:nbins
        f = fbin(b);
        if f >= lo && f <= mid
            fb(m,b) = (f - lo) / (mid - lo);
        elseif f > mid && f <= hi
            fb(m,b) = (hi - f) / (hi - mid);
        end
    end
end

figure; hold on;
for m = 1:nmels
    plot(fbin, fb(m,:));
end
nr_figure();
nr_caption('%d triangular mel filters', nmels);
```

+++

## 4 · Mel spectrogram

Slide a Hann window along the signal, FFT each frame, apply the filterbank, take
the log — a `mel bands × frames` image. That's the front end of nearly every
speech / audio model.

```matlab {jupyter.code-cell}
win = hann(nfft)';               % row window
hop = nfft/2;
starts  = 1:hop:(N - nfft);
nframes = numel(starts);

S = zeros(nmels, nframes);
for j = 1:nframes
    s0    = starts(j);
    frame = x(s0:s0+nfft-1) .* win;
    P     = abs(fft(frame)).^2;
    P     = P(1:nbins);
    melE  = fb * P';             % nmels x 1
    S(:,j) = log10(melE + 1e-6);
end

nr_heatmap(S, sprintf('mel spectrogram — %d bands x %d frames', nmels, nframes));
nr_metric('frames', nframes, '%d');
nr_metric('mel bands', nmels, '%d');
```
