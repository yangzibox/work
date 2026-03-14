#!/usr/bin/env perl
use strict;
use warnings;
use Prima qw(Application Label ta);  # 显式导入 ta 命名空间，避免 bareword 错误

my $mw = Prima::MainWindow->create(
    text     => 'Test with ta::Center',
    size     => [400, 300],
    centered => 1,
);

$mw->insert('Label' =>
    text       => 'Hello World! (centered with constant)',
    pack       => { expand => 1, fill => 'both' },
    font       => { size => 24, style => 1 },
    alignment  => ta::Center,     # 用常量 ta::Center
    valignment => ta::Center,     # 同上
);

run Prima;