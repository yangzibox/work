#!/usr/bin/env perl
use strict;
use warnings;
use Prima qw(Application Label);

my $mw = Prima::MainWindow->create(
    text     => 'Modern Hello',
    size     => [500, 350],
    centered => 1,
);

# 简单渐变背景（现代感）
$mw->insert('Widget' =>
    origin   => [0, 0],
    size     => [$mw->size],
    growMode => 1,  # gm::Client = 1
    buffered => 1,
    onPaint  => sub {
        my ($self, $canvas) = @_;
        $canvas->clear;
        $canvas->color(0xFFFFFF);  # 白
        $canvas->bar(0, 0, $self->width, $self->height / 2);
        $canvas->color(0xE0F0FF);  # 浅蓝
        $canvas->bar(0, $self->height / 2, $self->width, $self->height);
    },
);

# 大标题（现代字体 + 居中）
$mw->insert('Label' =>
    text       => 'Hello World!',
    pack       => { expand => 1, fill => 'both' },
    font       => { size => 48, style => 1 },  # 1 = bold
    color      => 0x00008B,                    # 深蓝（DarkBlue 的 RGB）
    alignment  => 1,                           # 1 = center
    valignment => 1,                           # 1 = center
);

run Prima;