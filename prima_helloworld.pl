#!/usr/bin/env perl
use strict;
use warnings;
use Prima qw(Application);
use Prima::Label;   # 显式加载 Label，避免 bareword 问题

my $mw = Prima::MainWindow->create(
    text     => 'Hello Prima',
    size     => [400, 300],
    centered => 1,
);

$mw->insert('Label' =>                     # 用字符串 'Label' 创建控件
    text       => 'Hello World!',
    pack       => { expand => 1, fill => 'both' },
    font       => { size => 24, style => 1 },
    alignment  => 1,
    valignment => 1,
);

run Prima;