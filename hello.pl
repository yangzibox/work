#!/usr/bin/env perl

use strict;
use warnings;
use Tk;

my $mw = MainWindow->new;
$mw->title("退出測試");
$mw->geometry("300x150");

my $button = $mw->Button(
    -text    => "關閉並退出",
    -command => sub { exit }
)->pack(-side => 'top', -fill => 'both', -expand => 1);

MainLoop;
